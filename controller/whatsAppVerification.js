import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion,
  DEFAULT_CONNECTION_CONFIG,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import P from "pino";
import LeadData from "../models/leadDataSchema.js";

class WhatsAppController {
  constructor() {
    // Store multiple client sessions by userId
    this.clients = new Map(); // userId -> { client, isConnected, qrCode, authFolder, reconnectAttempts, isInitializing, initPromise, initTimeout, lastError405Time }
    this.initPromises = new Map(); // Track initialization promises by userId
    this.checkQueue = [];
    this.isProcessing = false;
    this.MAX_RECONNECT_ATTEMPTS = 3;
    this.INIT_TIMEOUT = 30_000; // Reduced from 90s to 30s
    this.ERROR_405_COOLDOWN = 2_000; // Reduced from 10s to 2s
    this.ERROR_405_COOLDOWN_DEFAULT = 30_000;
  }

  /**
   * Automatically initialize sessions for all users who have saved credentials
   */
  async initAllSessions() {
    try {
      const sessionsDir = path.join(process.cwd(), "whatsapp_sessions");
      if (!fs.existsSync(sessionsDir)) {
        fs.mkdirSync(sessionsDir, { recursive: true });
        return;
      }

      const entries = fs.readdirSync(sessionsDir);
      console.log(`🔍 Found ${entries.length} potential WhatsApp sessions to restore.`);

      for (const userId of entries) {
        const userPath = path.join(sessionsDir, userId);
        if (fs.lstatSync(userPath).isDirectory()) {
          // Check if creds.json exists (basic check for valid session)
          if (fs.existsSync(path.join(userPath, "creds.json"))) {
            console.log(`[WhatsApp] Restoring session for user: ${userId}`);
            this.initializeForUser(userId).catch(err => {
              console.error(`[WhatsApp] Failed to restore session for ${userId}:`, err.message);
            });
          }
        }
      }
    } catch (error) {
      console.error("[WhatsApp] Error during initAllSessions:", error);
    }
  }

  async initializeForUser(userIdInput, forceNewSession = false) {
    try {
      const userId = userIdInput?.toString();
      console.log(`Initializing WhatsApp client for user ${userId}...`);

      // Check if already initializing to prevent duplicate sessions
      const existingSession = this.clients.get(userId);

      // Check for 405 cooldown (prevent rapid reconnection attempts when WhatsApp is blocking)
      if (existingSession?.lastError405Time && !forceNewSession) {
        const timeSinceLastError =
          Date.now() - existingSession.lastError405Time;
        if (timeSinceLastError < this.ERROR_405_COOLDOWN) {
          const remainingCooldown = Math.ceil(
            (this.ERROR_405_COOLDOWN - timeSinceLastError) / 1000,
          );
          console.log(
            `⏳ Still in 405 cooldown for ${userId}. Please wait ${remainingCooldown}s before retrying.`,
          );
          const error = new Error(
            `WhatsApp is blocking connections. Please wait ${remainingCooldown} seconds before trying again.`,
          );
          error.statusCode = 429;
          error.remainingCooldown = remainingCooldown;
          throw error;
        } else {
          // Cooldown expired, clear the flag
          existingSession.lastError405Time = null;
        }
      } else if (forceNewSession) {
        // If forcing new session, clear cooldown
        if (existingSession) existingSession.lastError405Time = null;
      }

      if (existingSession?.isInitializing) {
        console.log(
          `User ${userId} session is already initializing, waiting for up to 90 seconds...`,
        );

        // Wait for the existing initialization to complete
        const existingPromise = this.initPromises.get(userId);
        if (existingPromise) {
          try {
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(
                () =>
                  reject(new Error("Initialization timeout after 90 seconds")),
                this.INIT_TIMEOUT,
              ),
            );
            await Promise.race([existingPromise, timeoutPromise]);
            console.log(`✅ Existing initialization completed for ${userId}`);
            return;
          } catch (err) {
            console.error(
              `⏱️  Initialization timeout for ${userId}:`,
              err.message,
            );
            // Force clear and reinitialize
            await this.clearSessionAndRegenerate(userId);
            existingSession.isInitializing = false;
            existingSession.needsReinitialization = true;
          }
        }
        return;
      }

      // If connected and not forcing new session, return

      if (existingSession?.isConnected && !forceNewSession) {
        console.log(`User ${userId} already connected`);
        return;
      }

      // Create and store initialization promise
      const initPromise = this._performInitialization(
        userId,
        forceNewSession,
        existingSession,
      );
      this.initPromises.set(userId, initPromise);

      try {
        await Promise.race([
          initPromise,
          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    `Initialization timeout after ${this.INIT_TIMEOUT}ms`,
                  ),
                ),
              this.INIT_TIMEOUT,
            ),
          ),
        ]);
      } finally {
        this.initPromises.delete(userId);
      }
    } catch (error) {
      console.error(
        `WhatsApp initialization error for user ${userId}:`,
        error.message,
      );
      const session = this.clients.get(userId);
      if (session) {
        session.isInitializing = false;
        session.lastError = { errorMessage: error.message };
      }
      this.initPromises.delete(userId);
      throw error;
    }
  }

  async _performInitialization(userId, forceNewSession, existingSession) {
    try {
      // Clean up existing client if any
      if (existingSession?.client) {
        try {
          existingSession.client.ev.removeAllListeners();
          existingSession.client.end();
        } catch (e) {
          console.log(`Error cleaning up old client for ${userId}:`, e.message);
        }
      }

      // Create user-specific auth folder
      const authFolder = path.join(process.cwd(), "whatsapp_sessions", userId);

      // If forcing new session, delete auth folder
      if (forceNewSession && fs.existsSync(authFolder)) {
        try {
          fs.rmSync(authFolder, { recursive: true, force: true });
          console.log(`Cleared auth folder for fresh session: ${userId}`);
        } catch (e) {
          console.error(`Failed to clear auth folder: ${e.message}`);
        }
      }

      // Ensure directory exists
      if (!fs.existsSync(authFolder)) {
        fs.mkdirSync(authFolder, { recursive: true });
      }

      const { state, saveCreds } = await useMultiFileAuthState(authFolder);

      // Create session object first to mark as initializing
      const session = {
        client: null,
        isConnected: false,
        qrCode: null,
        authFolder,
        reconnectAttempts: existingSession?.reconnectAttempts || 0,
        isInitializing: true,
        lastError: null,
      };
      this.clients.set(userId, session);

      // Create Pino logger for Baileys - simple configuration without pretty-print
      const logger = P({
        level: "error",
      });

      const { version, isLatest } = await fetchLatestBaileysVersion();
      console.log(`Using Baileys v${version.join(".")}, isLatest: ${isLatest}`);

      const client = makeWASocket({
        ...DEFAULT_CONNECTION_CONFIG,
        auth: state,
        version, // Use latest version
        logger,
        printQRInTerminal: false,
        browser: Browsers.macOS("Chrome"), // Stable identity
        syncFullHistory: false,
        markOnlineOnConnect: false, // Don't mark online immediately to avoid bot flags
        generateHighQualityLinkPreview: false,
        connectTimeoutMs: 30_000, 
        defaultQueryTimeoutMs: 30_000, 
        keepAliveIntervalMs: 15_000, 
        retryRequestDelayMs: 1_000, 
        qrTimeout: 60_000, 
        emitOwnEvents: true,
        fireInitQueries: false, // Don't fire immediately
        maxMsgRetryCount: 2,
        retryRequestCount: 2,
      });

      session.client = client;

      // Event handlers
      client.ev.on("creds.update", saveCreds);

      client.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr, isNewLogin } = update;
        const currentSession = this.clients.get(userId);

        if (!currentSession) return;

        // Store QR code for API access
        if (qr) {
          currentSession.qrCode = qr;
          currentSession.isInitializing = false;
          console.log(`QR Code generated for user ${userId}`);
        }

        if (connection === "open") {
          console.log(`✅ WhatsApp connected for user ${userId}!`);
          currentSession.isConnected = true;
          currentSession.qrCode = null;
          currentSession.isInitializing = false;
          currentSession.reconnectAttempts = 0;
          currentSession.lastError = null;
        }

        if (connection === "close") {
          const error = lastDisconnect?.error;
          const statusCode = error?.output?.statusCode || error?.status;
          const errorMessage =
            error?.message || "Connection closed without error";
          const reason = error?.output?.payload?.error || "unknown";

          console.log(`❌ WhatsApp disconnected for user ${userId}`);
          console.log(`Disconnect Error Details:`, {
            statusCode,
            errorMessage,
            reason,
            stack: error?.stack,
          });

          currentSession.isConnected = false;
          currentSession.isInitializing = false;
          currentSession.lastError = { statusCode, errorMessage, reason };

          // Handle different disconnect scenarios
          await this.handleDisconnect(userId, statusCode, errorMessage, reason);
        }
      });

      client.ev.on("messages.upsert", () => {
        // Handle incoming messages if needed
      });
    } catch (error) {
      console.error(
        `WhatsApp initialization error for user ${userId}:`,
        error.message,
      );
      const session = this.clients.get(userId);
      if (session) {
        session.isInitializing = false;
        session.lastError = { errorMessage: error.message };
      }
      throw error;
    }
  }

  async handleDisconnect(userId, statusCode, errorMessage, reason) {
    const session = this.clients.get(userId);
    if (!session) return;

    // For 405 errors, set cooldown and clear session
    if (statusCode === 405) {
      console.log(`⚠️  405 Method Not Allowed for user ${userId}`);
      console.log(
        `This typically means WhatsApp blocked the connection. Possible causes:`,
      );
      console.log(`- Device was already connected on another platform`);
      console.log(`- WhatsApp security check failed`);
      console.log(`- Device registration expired`);
      console.log(
        `Setting 2-second cooldown before allowing new connection attempt...`, // Corrected log message
      );

      // Set cooldown to prevent rapid reconnection attempts
      session.lastError405Time = Date.now();
      session.isInitializing = false; // Reset initializing state
      await this.clearSessionAndRegenerate(userId);
      return;
    }

    // Only reconnect if we were previously connected
    const shouldReconnect =
      session.isConnected &&
      session.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS;

    console.log(
      `Handling disconnect for ${userId}: statusCode=${statusCode}, reason=${reason}, shouldReconnect=${shouldReconnect}`,
    );

    // Connection issues - attempt reconnect with existing creds
    if (
      statusCode === DisconnectReason.connectionClosed ||
      statusCode === DisconnectReason.connectionLost ||
      statusCode === DisconnectReason.connectionReplaced ||
      statusCode === 408
    ) {
      if (shouldReconnect) {
        session.reconnectAttempts++;
        console.log(
          `Reconnecting user ${userId} (attempt ${session.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})...`,
        );
        await this.delay(2000 * session.reconnectAttempts);
        await this.initializeForUser(userId, false);
      } else {
        console.log(
          `Max reconnect attempts reached for ${userId}, waiting for manual reconnect`,
        );
        await this.clearSessionAndRegenerate(userId);
      }
      return;
    }

    // Restart required after pairing
    if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
      console.log(`Restart required for user ${userId}`);
      await this.delay(2000);
      await this.initializeForUser(userId, false);
      return;
    }

    // Timeout - reconnect with existing session
    if (statusCode === DisconnectReason.timedOut || statusCode === 428) {
      if (shouldReconnect) {
        session.reconnectAttempts++;
        console.log(`Timeout for user ${userId}, reconnecting...`);
        await this.delay(3000);
        await this.initializeForUser(userId, false);
      } else {
        await this.clearSessionAndRegenerate(userId);
      }
      return;
    }

    // Multi-device mismatch - need fresh session
    if (
      statusCode === DisconnectReason.multideviceMismatch ||
      statusCode === 440
    ) {
      console.log(`Multi-device mismatch for user ${userId}`);
      await this.clearSessionAndRegenerate(userId);
      return;
    }

    // Server errors - retry with delay
    if (statusCode === 500 || statusCode === 502 || statusCode === 503) {
      if (shouldReconnect) {
        session.reconnectAttempts++;
        console.log(`Server error for user ${userId}, retrying...`);
        await this.delay(5000);
        await this.initializeForUser(userId, false);
      }
      return;
    }

    // Unknown error - try reconnect once, then clear
    if (
      errorMessage.includes("Connection Failure") ||
      errorMessage.includes("Stream Errored")
    ) {
      console.log(`Connection failure for user ${userId}, clearing session`);
      await this.clearSessionAndRegenerate(userId);
    } else if (shouldReconnect) {
      session.reconnectAttempts++;
      const backoffTime = Math.min(
        3000 * Math.pow(2, session.reconnectAttempts - 1),
        30000,
      ); // Exponential backoff
      console.log(
        `Reconnecting with ${backoffTime}ms backoff (attempt ${session.reconnectAttempts})`,
      );
      await this.delay(backoffTime);
      await this.initializeForUser(userId, false);
    }
  }

  async clearSessionAndRegenerate(userIdInput) {
    const userId = userIdInput?.toString();
    const session = this.clients.get(userId);

    // Clean up client
    if (session?.client) {
      try {
        session.client.ev.removeAllListeners();
        session.client.end();
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    // Delete auth folder
    const authFolder = path.join(process.cwd(), "whatsapp_sessions", userId);
    if (fs.existsSync(authFolder)) {
      try {
        fs.rmSync(authFolder, { recursive: true, force: true });
        console.log(`Cleared auth folder for user ${userId}`);
      } catch (e) {
        console.error(`Failed to clear auth folder: ${e.message}`);
      }
    }

    // Reset session state but keep in map so we know user tried to connect
    this.clients.set(userId, {
      client: null,
      isConnected: false,
      qrCode: null,
      authFolder,
      reconnectAttempts: 0,
      isInitializing: false,
      lastError: session?.lastError || null,
      needsReinitialization: true,
    });

    console.log(
      `Session cleared for user ${userId}, ready for fresh initialization`,
    );
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getUserSession(userIdInput) {
    const userId = userIdInput?.toString();
    return this.clients.get(userId) || null;
  }

  async checkSingleNumber(userId, phoneNumber) {
    const session = this.getUserSession(userId);

    if (!session) {
      throw new Error(
        "WhatsApp session not initialized. Please initialize first.",
      );
    }

    if (!session.isConnected || !session.client) {
      throw new Error("WhatsApp not connected. Please scan QR code first.");
    }

    try {
      const cleanNumber = phoneNumber.replace(/\D/g, "");
      const jid = cleanNumber + "@s.whatsapp.net";

      const [result] = await session.client.onWhatsApp(jid);

      return {
        success: true,
        data: {
          phoneNumber,
          isRegistered: result?.exists || false,
          whatsappId: result?.jid || null,
          isBusiness: result?.isBusiness || false,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      // If connection error, mark session as disconnected
      if (
        error.message.includes("Connection") ||
        error.message.includes("closed")
      ) {
        session.isConnected = false;
      }
      return {
        success: false,
        error: error.message,
        phoneNumber,
      };
    }
  }

  async checkMultipleNumbers(userId, phoneNumbers, operationId = null) {
    const session = this.getUserSession(userId);

    if (!session || !session.isConnected || !session.client) {
      throw new Error("WhatsApp not connected. Please scan QR code first.");
    }

    const results = [];
    const verificationsToSave = [];

    // Batch check using onWhatsApp API (more efficient)
    try {
      const cleanNumbers = phoneNumbers.map(
        (num) => num.replace(/\D/g, "") + "@s.whatsapp.net",
      );
      const batchResults = await session.client.onWhatsApp(...cleanNumbers);
      
      // Create a map of results for easy lookup since onWhatsApp only returns existing numbers
      // and not necessarily in the same order.
      const resultsMap = new Map();
      if (Array.isArray(batchResults)) {
        batchResults.forEach(res => {
          if (res.exists) {
            // Normalize JID by removing device suffix (e.g., 12345678:0@s.whatsapp.net -> 12345678@s.whatsapp.net)
            const normalizedJid = res.jid.split(':')[0].split('@')[0] + '@s.whatsapp.net';
            resultsMap.set(normalizedJid, res);
          }
        });
      }

      for (let i = 0; i < phoneNumbers.length; i++) {
        const phoneNumber = phoneNumbers[i];
        // Normalize our query JID too (though it shouldn't have : suffix, safety first)
        const queryJid = cleanNumbers[i].split(':')[0].split('@')[0] + '@s.whatsapp.net';
        const result = resultsMap.get(queryJid);
        const isRegistered = !!result;

        const verificationData = {
          phoneNumber,
          isRegistered,
          whatsappId: result?.jid || null,
          isBusiness: result?.isBusiness || false,
          verifiedAt: new Date().toISOString(),
        };

        results.push({
          success: true,
          data: verificationData,
        });

        // Store for LeadData update
        verificationsToSave.push({
          phone: phoneNumber,
          phoneDigits: phoneNumber.replace(/\D/g, ""),
          status: isRegistered ? "verified" : "not-verified",
        });
      }

      // Update LeadData documents directly by phone number
      if (verificationsToSave.length > 0) {
        try {
          let updatedCount = 0;

          // Build base filter - scope to user and optionally operation
          // Convert string IDs to ObjectIds for proper MongoDB matching
          const baseFilter = {};
          if (userId) {
            baseFilter.userId =
              typeof userId === "string"
                ? new mongoose.Types.ObjectId(userId)
                : userId;
          }
          if (operationId) {
            baseFilter.operationId =
              typeof operationId === "string"
                ? new mongoose.Types.ObjectId(operationId)
                : operationId;
          }

          console.log(
            "Base filter for WhatsApp update:",
            JSON.stringify(baseFilter),
          );

          for (const { phone, phoneDigits, status } of verificationsToSave) {
            console.log(
              `Updating WhatsApp status for phone: ${phone}, digits: ${phoneDigits}, status: ${status}`,
            );

            // Strategy 1: Exact match (including the + symbol)
            let result = await LeadData.updateMany(
              { ...baseFilter, phone: phone },
              {
                $set: {
                  whatsappStatus: status,
                  whatsappVerifiedAt: new Date(),
                },
              },
            );

            if (result.modifiedCount > 0) {
              updatedCount += result.modifiedCount;
              console.log(
                `Strategy 1 (exact match): Updated ${result.modifiedCount} leads`,
              );
              continue;
            }

            // Strategy 2: Match phone field containing the digits
            const last10Digits = phoneDigits.slice(-10);
            result = await LeadData.updateMany(
              { ...baseFilter, phone: { $regex: last10Digits, $options: "i" } },
              {
                $set: {
                  whatsappStatus: status,
                  whatsappVerifiedAt: new Date(),
                },
              },
            );

            if (result.modifiedCount > 0) {
              updatedCount += result.modifiedCount;
              console.log(
                `Strategy 2 (last 10 digits): Updated ${result.modifiedCount} leads`,
              );
              continue;
            }

            // Strategy 3: Find leads in this operation and match manually
            const leads = await LeadData.find({
              ...baseFilter,
              phone: { $exists: true, $ne: "" },
            });
            for (const lead of leads) {
              const leadDigits = lead.phone.replace(/\D/g, "");
              // Match if last 9 digits are the same
              if (
                leadDigits.length >= 9 &&
                phoneDigits.length >= 9 &&
                leadDigits.slice(-9) === phoneDigits.slice(-9)
              ) {
                await LeadData.updateOne(
                  { _id: lead._id },
                  {
                    $set: {
                      whatsappStatus: status,
                      whatsappVerifiedAt: new Date(),
                    },
                  },
                );
                updatedCount++;
                console.log(
                  `Strategy 3 (manual match): Updated lead ${lead._id} - DB phone: ${lead.phone}, input: ${phone}`,
                );
              }
            }
          }

          console.log(
            `Total updated WhatsApp status for ${updatedCount} leads`,
          );
        } catch (dbError) {
          console.error(
            "Failed to update WhatsApp status in LeadData:",
            dbError,
          );
        }
      }
    } catch (error) {
      console.error("Batch verification error:", error);

      // If connection error, mark session as disconnected
      if (
        error.message.includes("Connection") ||
        error.message.includes("closed")
      ) {
        session.isConnected = false;
        throw new Error("WhatsApp connection lost. Please reconnect.");
      }

      // Fallback to individual checks
      for (const number of phoneNumbers) {
        try {
          const result = await this.checkSingleNumber(userId, number);
          results.push(result);
          await this.delay(500);
        } catch (error) {
          results.push({
            success: false,
            error: error.message,
            phoneNumber: number,
          });
        }
      }
    }

    return results;
  }

  /**
   * Send a message to a number using user's WhatsApp session
   */
  async sendMessage(userId, to, content) {
    const session = this.getUserSession(userId);

    if (!session) {
      throw new Error("WhatsApp session not initialized. Please connect first.");
    }

    if (!session.isConnected || !session.client) {
      throw new Error("WhatsApp not connected. Please scan QR code first.");
    }

    try {
      const cleanNumber = to.replace(/\D/g, "");
      const jid = cleanNumber + "@s.whatsapp.net";

      // Check if number is on WhatsApp
      const [exists] = await session.client.onWhatsApp(jid);
      if (!exists?.exists) {
        throw new Error(`Number ${to} is not registered on WhatsApp`);
      }

      let messagePayload;
      if (typeof content === "string") {
        messagePayload = { text: content };
      } else if (content.text) {
        messagePayload = { text: content.text };
      } else {
        throw new Error("Invalid message content");
      }

      // Send the message
      const result = await session.client.sendMessage(jid, messagePayload);

      return {
        success: true,
        messageId: result.key.id,
        timestamp: new Date().toISOString(),
        recipient: to,
        userId
      };
    } catch (error) {
      console.error(`❌ Failed to send message from user ${userId}:`, error);
      throw error;
    }
  }

  getStatus(userId) {
    const session = this.getUserSession(userId);

    if (!session) {
      return {
        isConnected: false,
        hasQRCode: false,
        qrCode: null,
        initialized: false,
        isInitializing: false,
        needsReinitialization: false,
        lastError: null,
        phoneNumber: null,
      };
    }

    // Extract phone number from connected client
    let phoneNumber = null;
    if (session.isConnected && session.client?.user?.id) {
      // Format: 923001234567:0@s.whatsapp.net -> +923001234567
      const userJid = session.client.user.id;
      const numberPart = userJid.split(":")[0].split("@")[0];
      phoneNumber = "+" + numberPart;
    }

    // Calculate remaining cooldown if any
    let remainingCooldown = 0;
    let isInCooldown = false;
    if (session.lastError405Time) {
      const timeSinceLastError = Date.now() - session.lastError405Time;
      if (timeSinceLastError < this.ERROR_405_COOLDOWN) {
        remainingCooldown = Math.ceil(
          (this.ERROR_405_COOLDOWN - timeSinceLastError) / 1000,
        );
        isInCooldown = true;
      }
    }

    return {
      isConnected: session.isConnected,
      hasQRCode: !!session.qrCode,
      qrCode: session.qrCode,
      initialized: true,
      isInitializing: session.isInitializing || false,
      needsReinitialization: session.needsReinitialization || false,
      lastError: session.lastError || null,
      phoneNumber: phoneNumber,
      isInCooldown: isInCooldown,
      remainingCooldown: remainingCooldown,
    };
  }

  getQRCode(userId) {
    const session = this.getUserSession(userId);
    return session?.qrCode || null;
  }

  async disconnect(userIdInput) {
    const userId = userIdInput?.toString();
    const session = this.getUserSession(userId);

    if (session) {
      // Clean up event listeners and close connection
      if (session.client) {
        try {
          session.client.ev.removeAllListeners();
          session.client.end();
        } catch (e) {
          // Ignore cleanup errors
        }
      }

      session.isConnected = false;
      session.qrCode = null;
      this.clients.delete(userId);
      console.log(`WhatsApp client disconnected for user ${userId}`);

      // Delete auth folder to prevent auto-reconnect
      if (session.authFolder && fs.existsSync(session.authFolder)) {
        try {
          fs.rmSync(session.authFolder, { recursive: true, force: true });
          console.log(`Deleted auth folder for user ${userId}`);
        } catch (error) {
          console.error(
            `Failed to delete auth folder for user ${userId}:`,
            error,
          );
        }
      }
    }
  }

  disconnectAll() {
    for (const [userId, session] of this.clients.entries()) {
      if (session.client) {
        try {
          session.client.ev.removeAllListeners();
          session.client.end();
        } catch (e) {
          // Ignore cleanup errors
        }
        console.log(`Disconnected user ${userId}`);
      }
    }
    this.clients.clear();
  }
}

// Singleton instance
const whatsappController = new WhatsAppController();

export default whatsappController;
