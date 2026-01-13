import { makeWASocket, useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import LeadData from "../models/leadDataSchema.js";

class WhatsAppController {
    constructor() {
        // Store multiple client sessions by userId
        this.clients = new Map() // userId -> { client, isConnected, qrCode, authFolder, reconnectAttempts, isInitializing }
        this.checkQueue = []
        this.isProcessing = false
        this.MAX_RECONNECT_ATTEMPTS = 3
    }

    async initializeForUser(userIdInput, forceNewSession = false) {
        try {
            const userId = userIdInput?.toString()
            console.log(`Initializing WhatsApp client for user ${userId}...`)

            // Check if already initializing to prevent duplicate sessions
            const existingSession = this.clients.get(userId)
            if (existingSession?.isInitializing) {
                console.log(`User ${userId} session is already initializing, waiting...`)
                return
            }

            // If connected and not forcing new session, return
            if (existingSession?.isConnected && !forceNewSession) {
                console.log(`User ${userId} already connected`)
                return
            }

            // Clean up existing client if any
            if (existingSession?.client) {
                try {
                    existingSession.client.ev.removeAllListeners()
                    existingSession.client.end()
                } catch (e) {
                    console.log(`Error cleaning up old client for ${userId}:`, e.message)
                }
            }

            // Create user-specific auth folder
            const authFolder = path.join(process.cwd(), 'whatsapp_sessions', userId)

            // If forcing new session, delete auth folder
            if (forceNewSession && fs.existsSync(authFolder)) {
                try {
                    fs.rmSync(authFolder, { recursive: true, force: true })
                    console.log(`Cleared auth folder for fresh session: ${userId}`)
                } catch (e) {
                    console.error(`Failed to clear auth folder: ${e.message}`)
                }
            }

            // Ensure directory exists
            if (!fs.existsSync(authFolder)) {
                fs.mkdirSync(authFolder, { recursive: true })
            }

            const { state, saveCreds } = await useMultiFileAuthState(authFolder)

            // Create session object first to mark as initializing
            const session = {
                client: null,
                isConnected: false,
                qrCode: null,
                authFolder,
                reconnectAttempts: existingSession?.reconnectAttempts || 0,
                isInitializing: true,
                lastError: null
            }
            this.clients.set(userId, session)

            const client = makeWASocket({
                auth: state,
                printQRInTerminal: false,
                browser: ['Chrome (Linux)', '', ''],
                syncFullHistory: false,
                markOnlineOnConnect: false,
                generateHighQualityLinkPreview: false,
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 60000,
                keepAliveIntervalMs: 25000,
                retryRequestDelayMs: 500,
                qrTimeout: 60000
            })

            session.client = client

            // Event handlers
            client.ev.on('creds.update', saveCreds)

            client.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update
                const currentSession = this.clients.get(userId)

                if (!currentSession) return

                // Store QR code for API access
                if (qr) {
                    currentSession.qrCode = qr
                    currentSession.isInitializing = false
                    console.log(`QR Code generated for user ${userId}`)
                    // qrcode.generate(qr, { small: true }) // Removed to reduce terminal clutter
                }

                if (connection === 'open') {
                    console.log(`✅ WhatsApp connected for user ${userId}!`)
                    currentSession.isConnected = true
                    currentSession.qrCode = null
                    currentSession.isInitializing = false
                    currentSession.reconnectAttempts = 0
                    currentSession.lastError = null
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode
                    const errorMessage = lastDisconnect?.error?.message || 'unknown'
                    const reason = lastDisconnect?.error?.output?.payload?.error

                    console.log(`❌ WhatsApp disconnected for user ${userId}`)
                    console.log(`Disconnect reason: ${errorMessage}, Status: ${statusCode}, Reason: ${reason}`)

                    currentSession.isConnected = false
                    currentSession.isInitializing = false
                    currentSession.lastError = { statusCode, errorMessage, reason }

                    // Handle different disconnect scenarios
                    await this.handleDisconnect(userId, statusCode, errorMessage, reason)
                }
            })

            client.ev.on('messages.upsert', () => {
                // Handle incoming messages if needed
            })

        } catch (error) {
            console.error(`WhatsApp initialization error for user ${userId}:`, error)
            const session = this.clients.get(userId)
            if (session) {
                session.isInitializing = false
                session.lastError = { errorMessage: error.message }
            }
            throw error
        }
    }

    async handleDisconnect(userId, statusCode, errorMessage, reason) {
        const session = this.clients.get(userId)
        if (!session) return

        // Only reconnect if we were previously connected. 
        // If we were just initializing/waiting for QR, let the user trigger it again manually.
        const shouldReconnect = session.isConnected && session.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS

        switch (statusCode) {
            case DisconnectReason.loggedOut:
            case 401:
                // Logged out or bad credentials - need fresh QR
                console.log(`Session logged out for user ${userId}, clearing and waiting for new scan`)
                await this.clearSessionAndRegenerate(userId)
                break

            case DisconnectReason.connectionClosed:
            case DisconnectReason.connectionLost:
            case DisconnectReason.connectionReplaced:
            case 408:
                // Connection issues - attempt reconnect with existing creds
                if (shouldReconnect) {
                    session.reconnectAttempts++
                    console.log(`Reconnecting user ${userId} (attempt ${session.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})...`)
                    await this.delay(2000 * session.reconnectAttempts)
                    await this.initializeForUser(userId, false)
                } else {
                    console.log(`Max reconnect attempts reached for ${userId}, waiting for manual reconnect`)
                    await this.clearSessionAndRegenerate(userId)
                }
                break

            case DisconnectReason.restartRequired:
            case 515:
                // Restart required after pairing
                console.log(`Restart required for user ${userId}`)
                await this.delay(2000)
                await this.initializeForUser(userId, false)
                break

            case DisconnectReason.timedOut:
            case 428:
                // Timeout - reconnect with existing session
                if (shouldReconnect) {
                    session.reconnectAttempts++
                    console.log(`Timeout for user ${userId}, reconnecting...`)
                    await this.delay(3000)
                    await this.initializeForUser(userId, false)
                } else {
                    await this.clearSessionAndRegenerate(userId)
                }
                break

            case DisconnectReason.multideviceMismatch:
            case 440:
                // Multi-device mismatch - need fresh session
                console.log(`Multi-device mismatch for user ${userId}`)
                await this.clearSessionAndRegenerate(userId)
                break

            case 500:
            case 502:
            case 503:
                // Server errors - retry with delay
                if (shouldReconnect) {
                    session.reconnectAttempts++
                    console.log(`Server error for user ${userId}, retrying...`)
                    await this.delay(5000)
                    await this.initializeForUser(userId, false)
                }
                break

            default:
                // Unknown error - try reconnect once, then clear
                if (errorMessage.includes('Connection Failure') || errorMessage.includes('Stream Errored')) {
                    console.log(`Connection failure for user ${userId}, clearing session`)
                    await this.clearSessionAndRegenerate(userId)
                } else if (shouldReconnect) {
                    session.reconnectAttempts++
                    await this.delay(3000)
                    await this.initializeForUser(userId, false)
                }
                break
        }
    }

    async clearSessionAndRegenerate(userIdInput) {
        const userId = userIdInput?.toString()
        const session = this.clients.get(userId)

        // Clean up client
        if (session?.client) {
            try {
                session.client.ev.removeAllListeners()
                session.client.end()
            } catch (e) {
                // Ignore cleanup errors
            }
        }

        // Delete auth folder
        const authFolder = path.join(process.cwd(), 'whatsapp_sessions', userId)
        if (fs.existsSync(authFolder)) {
            try {
                fs.rmSync(authFolder, { recursive: true, force: true })
                console.log(`Cleared auth folder for user ${userId}`)
            } catch (e) {
                console.error(`Failed to clear auth folder: ${e.message}`)
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
            needsReinitialization: true
        })

        console.log(`Session cleared for user ${userId}, ready for fresh initialization`)
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    getUserSession(userIdInput) {
        const userId = userIdInput?.toString()
        return this.clients.get(userId) || null
    }

    async checkSingleNumber(userId, phoneNumber) {
        const session = this.getUserSession(userId)

        if (!session) {
            throw new Error('WhatsApp session not initialized. Please initialize first.')
        }

        if (!session.isConnected || !session.client) {
            throw new Error('WhatsApp not connected. Please scan QR code first.')
        }

        try {
            const cleanNumber = phoneNumber.replace(/\D/g, '')
            const jid = cleanNumber + '@s.whatsapp.net'

            const [result] = await session.client.onWhatsApp(jid)

            return {
                success: true,
                data: {
                    phoneNumber,
                    isRegistered: result?.exists || false,
                    whatsappId: result?.jid || null,
                    isBusiness: result?.isBusiness || false,
                    timestamp: new Date().toISOString()
                }
            }
        } catch (error) {
            // If connection error, mark session as disconnected
            if (error.message.includes('Connection') || error.message.includes('closed')) {
                session.isConnected = false
            }
            return {
                success: false,
                error: error.message,
                phoneNumber
            }
        }
    }

    async checkMultipleNumbers(userId, phoneNumbers, operationId = null) {
        const session = this.getUserSession(userId)

        if (!session || !session.isConnected || !session.client) {
            throw new Error('WhatsApp not connected. Please scan QR code first.')
        }

        const results = []
        const verificationsToSave = []

        // Batch check using onWhatsApp API (more efficient)
        try {
            const cleanNumbers = phoneNumbers.map(num => num.replace(/\D/g, '') + '@s.whatsapp.net')
            const batchResults = await session.client.onWhatsApp(...cleanNumbers)

            for (let i = 0; i < phoneNumbers.length; i++) {
                const phoneNumber = phoneNumbers[i]
                const result = batchResults[i]
                const isRegistered = result?.exists || false

                const verificationData = {
                    phoneNumber,
                    isRegistered,
                    whatsappId: result?.jid || null,
                    isBusiness: result?.isBusiness || false,
                    verifiedAt: new Date().toISOString()
                }

                results.push({
                    success: true,
                    data: verificationData
                })

                // Store for LeadData update
                verificationsToSave.push({
                    phone: phoneNumber,
                    // Extract just digits for matching (phone in DB may have different format)
                    phoneDigits: phoneNumber.replace(/\D/g, ''),
                    status: isRegistered ? 'verified' : 'not-verified'
                })
            }

            // Update LeadData documents directly by phone number
            if (verificationsToSave.length > 0) {
                try {
                    let updatedCount = 0

                    // Build base filter - scope to user and optionally operation
                    // Convert string IDs to ObjectIds for proper MongoDB matching
                    const baseFilter = {}
                    if (userId) {
                        baseFilter.userId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId
                    }
                    if (operationId) {
                        baseFilter.operationId = typeof operationId === 'string' ? new mongoose.Types.ObjectId(operationId) : operationId
                    }

                    console.log('Base filter for WhatsApp update:', JSON.stringify(baseFilter))

                    for (const { phone, phoneDigits, status } of verificationsToSave) {
                        console.log(`Updating WhatsApp status for phone: ${phone}, digits: ${phoneDigits}, status: ${status}`)

                        // Strategy 1: Exact match (including the + symbol)
                        let result = await LeadData.updateMany(
                            { ...baseFilter, phone: phone },
                            {
                                $set: {
                                    whatsappStatus: status,
                                    whatsappVerifiedAt: new Date()
                                }
                            }
                        )

                        if (result.modifiedCount > 0) {
                            updatedCount += result.modifiedCount
                            console.log(`Strategy 1 (exact match): Updated ${result.modifiedCount} leads`)
                            continue
                        }

                        // Strategy 2: Match phone field containing the digits
                        const last10Digits = phoneDigits.slice(-10)
                        result = await LeadData.updateMany(
                            { ...baseFilter, phone: { $regex: last10Digits, $options: 'i' } },
                            {
                                $set: {
                                    whatsappStatus: status,
                                    whatsappVerifiedAt: new Date()
                                }
                            }
                        )

                        if (result.modifiedCount > 0) {
                            updatedCount += result.modifiedCount
                            console.log(`Strategy 2 (last 10 digits): Updated ${result.modifiedCount} leads`)
                            continue
                        }

                        // Strategy 3: Find leads in this operation and match manually
                        const leads = await LeadData.find({ ...baseFilter, phone: { $exists: true, $ne: '' } })
                        for (const lead of leads) {
                            const leadDigits = lead.phone.replace(/\D/g, '')
                            // Match if last 9 digits are the same
                            if (leadDigits.length >= 9 && phoneDigits.length >= 9 &&
                                leadDigits.slice(-9) === phoneDigits.slice(-9)) {
                                await LeadData.updateOne(
                                    { _id: lead._id },
                                    {
                                        $set: {
                                            whatsappStatus: status,
                                            whatsappVerifiedAt: new Date()
                                        }
                                    }
                                )
                                updatedCount++
                                console.log(`Strategy 3 (manual match): Updated lead ${lead._id} - DB phone: ${lead.phone}, input: ${phone}`)
                            }
                        }
                    }

                    console.log(`Total updated WhatsApp status for ${updatedCount} leads`)
                } catch (dbError) {
                    console.error('Failed to update WhatsApp status in LeadData:', dbError)
                }
            }

        } catch (error) {
            console.error('Batch verification error:', error)

            // If connection error, mark session as disconnected
            if (error.message.includes('Connection') || error.message.includes('closed')) {
                session.isConnected = false
                throw new Error('WhatsApp connection lost. Please reconnect.')
            }

            // Fallback to individual checks
            for (const number of phoneNumbers) {
                try {
                    const result = await this.checkSingleNumber(userId, number)
                    results.push(result)
                    await this.delay(500)
                } catch (error) {
                    results.push({
                        success: false,
                        error: error.message,
                        phoneNumber: number
                    })
                }
            }
        }

        return results
    }

    getStatus(userId) {
        const session = this.getUserSession(userId)

        if (!session) {
            return {
                isConnected: false,
                hasQRCode: false,
                qrCode: null,
                initialized: false,
                isInitializing: false,
                needsReinitialization: false,
                lastError: null,
                phoneNumber: null
            }
        }

        // Extract phone number from connected client
        let phoneNumber = null;
        if (session.isConnected && session.client?.user?.id) {
            // Format: 923001234567:0@s.whatsapp.net -> +923001234567
            const userJid = session.client.user.id;
            const numberPart = userJid.split(':')[0].split('@')[0];
            phoneNumber = '+' + numberPart;
        }

        return {
            isConnected: session.isConnected,
            hasQRCode: !!session.qrCode,
            qrCode: session.qrCode,
            initialized: true,
            isInitializing: session.isInitializing || false,
            needsReinitialization: session.needsReinitialization || false,
            lastError: session.lastError || null,
            phoneNumber: phoneNumber
        }
    }

    getQRCode(userId) {
        const session = this.getUserSession(userId)
        return session?.qrCode || null
    }

    async disconnect(userIdInput) {
        const userId = userIdInput?.toString()
        const session = this.getUserSession(userId)

        if (session) {
            // Clean up event listeners and close connection
            if (session.client) {
                try {
                    session.client.ev.removeAllListeners()
                    session.client.end()
                } catch (e) {
                    // Ignore cleanup errors
                }
            }

            session.isConnected = false
            session.qrCode = null
            this.clients.delete(userId)
            console.log(`WhatsApp client disconnected for user ${userId}`)

            // Delete auth folder to prevent auto-reconnect
            if (session.authFolder && fs.existsSync(session.authFolder)) {
                try {
                    fs.rmSync(session.authFolder, { recursive: true, force: true })
                    console.log(`Deleted auth folder for user ${userId}`)
                } catch (error) {
                    console.error(`Failed to delete auth folder for user ${userId}:`, error)
                }
            }
        }
    }

    disconnectAll() {
        for (const [userId, session] of this.clients.entries()) {
            if (session.client) {
                try {
                    session.client.ev.removeAllListeners()
                    session.client.end()
                } catch (e) {
                    // Ignore cleanup errors
                }
                console.log(`Disconnected user ${userId}`)
            }
        }
        this.clients.clear()
    }
}

// Singleton instance
const whatsappController = new WhatsAppController();

export default whatsappController;
