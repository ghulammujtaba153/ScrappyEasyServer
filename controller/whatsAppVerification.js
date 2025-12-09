import { makeWASocket, useMultiFileAuthState } from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import path from "path";
import fs from "fs";

class WhatsAppController {
    constructor() {
        // Store multiple client sessions by userId
        this.clients = new Map() // userId -> { client, isConnected, qrCode, authFolder }
        this.checkQueue = []
        this.isProcessing = false
    }

    async initializeForUser(userId) {
        try {
            console.log(`Initializing WhatsApp client for user ${userId}...`)

            // Check if already initialized
            if (this.clients.has(userId)) {
                const session = this.clients.get(userId)
                if (session.isConnected) {
                    console.log(`User ${userId} already connected`)
                    return
                }
            }

            // Create user-specific auth folder
            const authFolder = path.join(process.cwd(), 'whatsapp_sessions', userId)
            
            // Ensure directory exists
            if (!fs.existsSync(authFolder)) {
                fs.mkdirSync(authFolder, { recursive: true })
            }

            const { state, saveCreds } = await useMultiFileAuthState(authFolder)

            const client = makeWASocket({
                auth: state,
                printQRInTerminal: false,
                browser: ['Chrome (Linux)', '', ''],
                syncFullHistory: false,
                markOnlineOnConnect: false,
                generateHighQualityLinkPreview: false
            })

            // Create session object
            const session = {
                client,
                isConnected: false,
                qrCode: null,
                authFolder
            }

            this.clients.set(userId, session)

            // Event handlers
            client.ev.on('creds.update', saveCreds)

            client.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect, qr } = update

                // Store QR code for API access
                if (qr) {
                    session.qrCode = qr
                    console.log(`QR Code generated for user ${userId}`)
                    // Also show in terminal
                    qrcode.generate(qr, { small: true })
                }

                if (connection === 'open') {
                    console.log(`✅ WhatsApp connected for user ${userId}!`)
                    session.isConnected = true
                    session.qrCode = null
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode
                    const errorMessage = lastDisconnect?.error?.message || 'unknown'
                    
                    console.log(`❌ WhatsApp disconnected for user ${userId}`)
                    console.log(`Disconnect reason: ${errorMessage}`)
                    console.log(`Status code: ${statusCode}`)
                    
                    session.isConnected = false
                    
                    // Handle different disconnect scenarios
                    if (statusCode === 515) {
                        // Stream error after successful pairing - restart connection
                        console.log(`Restarting connection for user ${userId} after pairing...`)
                        setTimeout(() => {
                            if (this.clients.has(userId)) {
                                this.initializeForUser(userId).catch(console.error)
                            }
                        }, 2000)
                    } else if (statusCode === 401 || errorMessage.includes('Connection Failure')) {
                        // Bad credentials - clean up and require fresh QR
                        console.log(`Cleaning auth folder for user ${userId} due to connection error`)
                        this.disconnect(userId)
                    }
                    // For other errors, just stay disconnected - user can manually retry
                }
            })

            client.ev.on('messages.upsert', () => {
                // Handle incoming messages if needed
            })

        } catch (error) {
            console.error(`WhatsApp initialization error for user ${userId}:`, error)
            throw error
        }
    }

    getUserSession(userId) {
        if (!this.clients.has(userId)) {
            return null
        }
        return this.clients.get(userId)
    }

    async checkSingleNumber(userId, phoneNumber) {
        const session = this.getUserSession(userId)
        
        if (!session) {
            throw new Error('WhatsApp session not initialized. Please initialize first.')
        }

        if (!session.isConnected) {
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
            return {
                success: false,
                error: error.message,
                phoneNumber
            }
        }
    }

    async checkMultipleNumbers(userId, phoneNumbers) {
        const session = this.getUserSession(userId)
        
        if (!session || !session.isConnected) {
            throw new Error('WhatsApp not connected. Please scan QR code first.')
        }

        const results = []

        for (const number of phoneNumbers) {
            try {
                const result = await this.checkSingleNumber(userId, number)
                results.push(result)

                // Delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 500))

            } catch (error) {
                results.push({
                    success: false,
                    error: error.message,
                    phoneNumber: number
                })
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
                initialized: false
            }
        }

        return {
            isConnected: session.isConnected,
            hasQRCode: !!session.qrCode,
            qrCode: session.qrCode,
            initialized: true
        }
    }

    getQRCode(userId) {
        const session = this.getUserSession(userId)
        return session?.qrCode || null
    }

    disconnect(userId) {
        const session = this.getUserSession(userId)
        
        if (session && session.client) {
            session.client.end()
            session.isConnected = false
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
                session.client.end()
                console.log(`Disconnected user ${userId}`)
            }
        }
        this.clients.clear()
    }
}

// Singleton instance
const whatsappController = new WhatsAppController();

export default whatsappController;
