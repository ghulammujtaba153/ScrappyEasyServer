import { makeWASocket, useMultiFileAuthState } from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";

class WhatsAppController {
    constructor() {
        this.client = null
        this.isConnected = false
        this.qrCode = null
        this.authFolder = 'whatsapp_auth'
        this.checkQueue = []
        this.isProcessing = false
    }

    async initialize() {
        try {
            console.log('Initializing WhatsApp client...')

            const { state, saveCreds } = await useMultiFileAuthState(this.authFolder)

            this.client = makeWASocket({
                auth: state
            })

            // Event handlers
            this.client.ev.on('creds.update', saveCreds)

            this.client.ev.on('connection.update', (update) => {
                const { connection, qr } = update

                // Store QR code for API access
                if (qr) {
                    this.qrCode = qr
                    console.log('QR Code generated')
                    // Also show in terminal
                    qrcode.generate(qr, { small: true })
                }

                if (connection === 'open') {
                    console.log('✅ WhatsApp connected!')
                    this.isConnected = true
                    this.qrCode = null
                }

                if (connection === 'close') {
                    console.log('❌ WhatsApp disconnected')
                    this.isConnected = false
                }
            })

            this.client.ev.on('messages.upsert', () => {
                // Handle incoming messages if needed
            })

        } catch (error) {
            console.error('WhatsApp initialization error:', error)
            throw error
        }
    }

    async checkSingleNumber(phoneNumber) {
        if (!this.isConnected) {
            throw new Error('WhatsApp not connected. Please scan QR code first.')
        }

        try {
            const cleanNumber = phoneNumber.replace(/\D/g, '')
            const jid = cleanNumber + '@s.whatsapp.net'

            const [result] = await this.client.onWhatsApp(jid)

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

    async checkMultipleNumbers(phoneNumbers) {
        if (!this.isConnected) {
            throw new Error('WhatsApp not connected. Please scan QR code first.')
        }

        const results = []

        for (const number of phoneNumbers) {
            try {
                const result = await this.checkSingleNumber(number)
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

    getStatus() {
        return {
            isConnected: this.isConnected,
            hasQRCode: !!this.qrCode,
            qrCode: this.qrCode
        }
    }

    getQRCode() {
        return this.qrCode
    }

    disconnect() {
        if (this.client) {
            this.client.end()
            this.isConnected = false
            console.log('WhatsApp client disconnected')
        }
    }
}

// Singleton instance
const whatsappController = new WhatsAppController();

// Initialize on startup
whatsappController.initialize().catch(console.error);

export default whatsappController;