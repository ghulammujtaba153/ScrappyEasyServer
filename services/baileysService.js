// services/baileysService.js
import {
    default as makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers
} from "@whiskeysockets/baileys";
import pino from 'pino';
import QRCode from 'qrcode';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Logger
const logger = pino({ level: 'silent' });

// Store socket instance and state
let sock = null;
let isAuthenticated = false;
let currentQR = null;
let qrBase64 = null;

// Session data directory - separate from Puppeteer
const SESSION_DIR = path.join(__dirname, '../baileys_auth_info');

// Ensure session directory exists
if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
}

/**
 * Initialize Baileys WhatsApp connection
 */
export async function initializeBaileys() {
    try {
        console.log('[Baileys] Initializing WhatsApp socket...');

        // Initialize authentication state
        const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

        // Fetch latest version
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`[Baileys] Using WA v${version.join('.')}, isLatest: ${isLatest}`);

        // Create socket
        sock = makeWASocket({
            version,
            logger,
            auth: state,
            browser: Browsers.ubuntu('Chrome'),
            printQRInTerminal: false // We'll handle QR ourselves
        });

        // Handle credentials update
        sock.ev.on('creds.update', saveCreds);

        // Handle connection updates
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Authentication timeout - QR code not scanned'));
            }, 120000); // 2 minutes timeout

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                // Handle QR code
                if (qr) {
                    console.log('[Baileys] QR Code generated');
                    currentQR = qr;

                    // Generate base64 image for QR code
                    try {
                        qrBase64 = await QRCode.toDataURL(qr);
                        console.log('[Baileys] QR Code converted to base64');
                    } catch (err) {
                        console.error('[Baileys] QR conversion error:', err);
                    }
                }

                if (connection === 'close') {
                    clearTimeout(timeout);
                    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

                    console.log('[Baileys] Connection closed, should reconnect:', shouldReconnect);

                    if (lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) {
                        isAuthenticated = false;
                        sock = null;
                        reject(new Error('Logged out from WhatsApp'));
                    } else if (shouldReconnect) {
                        // Don't auto-reconnect during initialization
                        reject(new Error('Connection failed'));
                    }
                } else if (connection === 'open') {
                    clearTimeout(timeout);
                    console.log('[Baileys] ✅ Connected to WhatsApp!');
                    isAuthenticated = true;
                    currentQR = null;
                    qrBase64 = null;
                    resolve({
                        success: true,
                        message: 'WhatsApp connected successfully'
                    });
                }
            });
        });

    } catch (error) {
        console.error('[Baileys] Initialization error:', error.message);
        return {
            success: false,
            message: error.message
        };
    }
}

/**
 * Get current QR code
 */
export function getBaileysQR() {
    if (!qrBase64) {
        return {
            success: false,
            message: 'No QR code available. Please initialize first.'
        };
    }

    return {
        success: true,
        qr: qrBase64,
        message: 'Scan this QR code with WhatsApp'
    };
}

/**
 * Verify a single phone number
 */
async function checkNumberBaileys(phone) {
    try {
        if (!sock || !isAuthenticated) {
            throw new Error('WhatsApp not connected');
        }

        console.log(`[Baileys] Checking: ${phone}`);

        // Format number
        const cleanNumber = phone.replace(/\D/g, '');
        const formattedNumber = cleanNumber + '@s.whatsapp.net';

        // Check if number exists on WhatsApp
        const [result] = await sock.onWhatsApp(formattedNumber);

        if (result && result.exists) {
            console.log(`[Baileys] ✓ ${phone} - Has WhatsApp`);
            return {
                phone,
                exists: true,
                jid: result.jid,
                isBusiness: result.isBusiness || false
            };
        } else {
            console.log(`[Baileys] ✗ ${phone} - No WhatsApp`);
            return {
                phone,
                exists: false
            };
        }

    } catch (error) {
        console.error(`[Baileys] Error checking ${phone}:`, error.message);
        return {
            phone,
            exists: false,
            error: error.message
        };
    }
}

/**
 * Verify multiple phone numbers
 */
export async function verifyNumbersBaileys(numbers, onProgress) {
    if (!sock || !isAuthenticated) {
        throw new Error('WhatsApp not initialized. Call initializeBaileys() first.');
    }

    const results = [];
    const total = numbers.length;

    for (let i = 0; i < total; i++) {
        const phone = numbers[i];

        // Call progress callback
        if (onProgress) {
            onProgress({
                total,
                processed: i,
                current: phone
            });
        }

        const result = await checkNumberBaileys(phone);
        results.push(result);

        // Delay between checks to avoid rate limiting
        if (i < total - 1) {
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    // Final progress update
    if (onProgress) {
        onProgress({
            total,
            processed: total,
            current: null
        });
    }

    return results;
}

/**
 * Get Baileys authentication status
 */
export function getBaileysAuthStatus() {
    return {
        isAuthenticated,
        socketOpen: !!sock,
        hasQR: !!qrBase64
    };
}

/**
 * Close Baileys connection
 */
export async function closeBaileys() {
    if (sock) {
        await sock.logout();
        sock = null;
        isAuthenticated = false;
        currentQR = null;
        qrBase64 = null;
        console.log('[Baileys] Connection closed and logged out');
    }
}
