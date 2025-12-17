// services/whatsapp.service.js
import { default as makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys';
import qrcodeTerminal from 'qrcode-terminal';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

class WhatsAppService {
    constructor() {
        this.sessions = new Map();
        this.logger = pino({ level: process.env.NODE_ENV === 'production' ? 'error' : 'info' });
        this.sessionPath = process.env.SESSION_PATH || './whatsapp_sessions';
        this.ensureSessionDir();
    }

    ensureSessionDir() {
        if (!fs.existsSync(this.sessionPath)) {
            fs.mkdirSync(this.sessionPath, { recursive: true });
        }
    }

    /**
     * Initialize a new WhatsApp session
     */
    async initializeSession(sessionId = 'default') {
        try {
            const sessionDir = path.join(this.sessionPath, sessionId);

            if (!fs.existsSync(sessionDir)) {
                fs.mkdirSync(sessionDir, { recursive: true });
            }

            const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

            const { version } = await fetchLatestBaileysVersion();

            const sock = makeWASocket({
                version,
                auth: state,
                logger: this.logger,
                printQRInTerminal: true,
                browser: Browsers.ubuntu('Chrome'),
                syncFullHistory: false,
                emitOwnEvents: true,
                defaultQueryTimeoutMs: 0,
            });

            // Store credentials when updated
            sock.ev.on('creds.update', saveCreds);

            // Handle connection updates
            sock.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === 'open') {
                    console.log(`✅ WhatsApp session "${sessionId}" connected successfully`);

                    // Update session status
                    if (this.sessions.has(sessionId)) {
                        this.sessions.get(sessionId).connected = true;
                        this.sessions.get(sessionId).user = sock.user;
                    }
                }

                if (connection === 'close') {
                    console.log(`🔌 WhatsApp session "${sessionId}" disconnected`);

                    if (this.sessions.has(sessionId)) {
                        this.sessions.get(sessionId).connected = false;
                    }

                    // Auto-reconnect logic
                    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

                    if (shouldReconnect) {
                        console.log(`🔄 Attempting to reconnect session "${sessionId}"...`);
                        setTimeout(() => this.initializeSession(sessionId), 5000);
                    }
                }

                // Emit QR code if needed
                if (update.qr) {
                    console.log(`📱 QR Code received for session "${sessionId}"`);
                    qrcodeTerminal.generate(update.qr, { small: true }); // Print QR to terminal
                    if (this.sessions.has(sessionId)) {
                        this.sessions.get(sessionId).qrCode = update.qr;
                    }
                }
            });

            // Store session
            this.sessions.set(sessionId, {
                socket: sock,
                connected: false,
                user: null,
                qrCode: null,
                createdAt: new Date(),
                lastActivity: new Date()
            });

            return {
                success: true,
                sessionId,
                message: 'Session initialized successfully',
                qrCode: this.sessions.get(sessionId).qrCode
            };
        } catch (error) {
            console.error('❌ Failed to initialize WhatsApp session:', error);
            return {
                success: false,
                message: error.message
            };
        }
    }

    /**
     * Send a message to a number
     */
    async sendMessage(sessionId, to, content, options = {}) {
        try {
            // Validate session
            if (!this.sessions.has(sessionId)) {
                throw new Error(`Session "${sessionId}" not found`);
            }

            const session = this.sessions.get(sessionId);

            if (!session.connected) {
                throw new Error(`Session "${sessionId}" is not connected`);
            }

            const sock = session.socket;

            // Validate recipient number
            const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;

            // Check if number is on WhatsApp
            const [exists] = await sock.onWhatsApp(jid);
            if (!exists?.exists) {
                throw new Error(`Number ${to} is not registered on WhatsApp`);
            }

            let messagePayload;

            if (typeof content === 'string') {
                // Text message
                messagePayload = { text: content };
            } else if (content.text) {
                // Text with options
                messagePayload = { text: content.text };

                if (content.mentions && Array.isArray(content.mentions)) {
                    messagePayload.mentions = content.mentions.map(m =>
                        m.includes('@') ? m : `${m}@s.whatsapp.net`
                    );
                }
            } else {
                throw new Error('Invalid message content');
            }

            // Send the message
            const message = await sock.sendMessage(jid, messagePayload);

            // Update session activity
            session.lastActivity = new Date();

            return {
                success: true,
                messageId: message.key.id,
                timestamp: new Date().toISOString(),
                recipient: to,
                sessionId
            };
        } catch (error) {
            console.error('❌ Failed to send message:', error);
            throw error;
        }
    }

    /**
     * Send bulk messages
     */
    async sendBulkMessages(sessionId, recipients, content, options = {}) {
        const results = [];
        const { delayBetweenMessages = 1000, batchSize = 10 } = options;

        for (let i = 0; i < recipients.length; i += batchSize) {
            const batch = recipients.slice(i, i + batchSize);
            const batchPromises = [];

            for (const recipient of batch) {
                batchPromises.push(
                    this.sendMessage(sessionId, recipient, content)
                        .then(result => ({ recipient, success: true, ...result }))
                        .catch(error => ({
                            recipient,
                            success: false,
                            error: error.message
                        }))
                );

                // Add delay between messages in batch
                if (delayBetweenMessages > 0) {
                    await new Promise(resolve => setTimeout(resolve, delayBetweenMessages));
                }
            }

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);

            // Add batch delay if specified
            if (options.delayBetweenBatches && i + batchSize < recipients.length) {
                await new Promise(resolve => setTimeout(resolve, options.delayBetweenBatches));
            }
        }

        return {
            success: true,
            total: recipients.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results
        };
    }

    /**
     * Get session status
     */
    getSessionStatus(sessionId) {
        if (!this.sessions.has(sessionId)) {
            return null;
        }

        const session = this.sessions.get(sessionId);
        return {
            sessionId,
            connected: session.connected,
            user: session.user ? {
                id: session.user.id,
                name: session.user.name
            } : null,
            createdAt: session.createdAt,
            lastActivity: session.lastActivity,
            qrCode: session.qrCode // Return the QR code string
        };
    }

    /**
     * Get all sessions
     */
    getAllSessions() {
        const sessions = [];

        for (const [sessionId, session] of this.sessions.entries()) {
            sessions.push({
                sessionId,
                connected: session.connected,
                user: session.user ? {
                    id: session.user.id,
                    name: session.user.name
                } : null,
                createdAt: session.createdAt,
                lastActivity: session.lastActivity
            });
        }

        return sessions;
    }

    /**
     * Disconnect session
     */
    async disconnectSession(sessionId) {
        try {
            if (!this.sessions.has(sessionId)) {
                throw new Error(`Session "${sessionId}" not found`);
            }

            const session = this.sessions.get(sessionId);

            if (session.socket) {
                await session.socket.end();
            }

            this.sessions.delete(sessionId);

            return {
                success: true,
                message: `Session "${sessionId}" disconnected successfully`
            };
        } catch (error) {
            console.error('❌ Failed to disconnect session:', error);
            throw error;
        }
    }

    /**
     * Logout and clear session
     */
    async logoutSession(sessionId) {
        try {
            // Disconnect first
            await this.disconnectSession(sessionId);

            // Remove session directory
            const sessionDir = path.join(this.sessionPath, sessionId);
            if (fs.existsSync(sessionDir)) {
                fs.rmSync(sessionDir, { recursive: true, force: true });
            }

            return {
                success: true,
                message: `Session "${sessionId}" logged out and cleared`
            };
        } catch (error) {
            console.error('❌ Failed to logout session:', error);
            throw error;
        }
    }
}

// Singleton instance
export default new WhatsAppService();