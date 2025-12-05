// services/whatsappVerification.js
import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store browser instance and page
let browser = null;
let page = null;
let isAuthenticated = false;

// Session data directory
const SESSION_DIR = path.join(__dirname, '../whatsapp-session');

// Ensure session directory exists
if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
}

/**
 * Initialize WhatsApp Web with Puppeteer
 */
export async function initializeWhatsApp() {
    try {
        console.log('[WhatsApp] Initializing browser...');

        browser = await puppeteer.launch({
            headless: false, // Show browser for QR code scanning
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ],
            userDataDir: SESSION_DIR // Persist session
        });

        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log('[WhatsApp] Navigating to WhatsApp Web...');
        await page.goto('https://web.whatsapp.com', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        // Wait for either QR code or chat list (if already logged in)
        console.log('[WhatsApp] Waiting for authentication...');



        try {
            await page.waitForSelector('[aria-label="Chat list"], [data-testid="chat-list"], [aria-label="list"]', { timeout: 120000 });
            isAuthenticated = true;
            console.log('[WhatsApp] ✓ Already authenticated!');
        } catch (err) {
            console.log('[WhatsApp] QR Code displayed. Please scan with your phone.');
            console.log('[WhatsApp] Waiting for QR code scan...');

            // Wait for chat list after QR scan
            await page.waitForSelector('[aria-label="Chat list"], [data-testid="chat-list"], [aria-label="list"]', { timeout: 180000 });
            isAuthenticated = true;
            console.log('[WhatsApp] ✓ Authentication successful!');
        }

        return { success: true, message: 'WhatsApp Web initialized' };

    } catch (error) {
        console.error('[WhatsApp] Initialization error:', error.message);
        return { success: false, message: error.message };
    }
}

/**
 * Check if a phone number has WhatsApp
 */
async function checkNumber(phone) {
    try {
        const cleanPhone = phone.replace(/[^0-9+]/g, '');
        const url = `https://web.whatsapp.com/send?phone=${cleanPhone}`;

        console.log(`[WhatsApp] Checking: ${phone}`);

        // Navigate to the number
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });

        // Wait longer for WhatsApp to fully load the chat
        await new Promise(r => setTimeout(r, 5000));

        // Check for error dialog (number doesn't have WhatsApp)
        const errorDialog = await page.$('div[role="dialog"]');

        if (errorDialog) {
            const dialogText = await page.evaluate(el => el.innerText, errorDialog);

            if (dialogText.toLowerCase().includes('phone number shared via url is invalid') ||
                dialogText.toLowerCase().includes('not a whatsapp') ||
                dialogText.toLowerCase().includes('invalid')) {
                console.log(`[WhatsApp] ✗ ${phone} - No WhatsApp`);
                return { phone, exists: false, method: 'error-dialog' };
            }
        }

        // Check for chat input (number has WhatsApp)
        const inputSelectors = [
            'div[contenteditable="true"][data-tab="10"]',
            'div[contenteditable="true"][data-tab="6"]',
            'footer div[contenteditable="true"]',
            'div[data-testid="conversation-compose-box-input"]',
            'footer[role="toolbar"]'
        ];

        // Try to wait for any input selector to appear (with timeout)
        try {
            await page.waitForSelector(inputSelectors.join(', '), { timeout: 3000 });
        } catch (e) {
            // Timeout is ok, we'll check manually below
        }

        for (const selector of inputSelectors) {
            const input = await page.$(selector);
            if (input) {
                console.log(`[WhatsApp] ✓ ${phone} - Has WhatsApp`);
                return { phone, exists: true, method: `input-${selector}` };
            }
        }

        // If neither found, assume no WhatsApp
        console.log(`[WhatsApp] ⚠️ ${phone} - Uncertain (assuming no WhatsApp)`);
        return { phone, exists: false, method: 'no-elements-found' };

    } catch (error) {
        console.error(`[WhatsApp] Error checking ${phone}:`, error.message);
        return { phone, exists: false, error: error.message };
    }
}

/**
 * Verify multiple phone numbers
 */
export async function verifyNumbers(numbers, onProgress) {
    if (!isAuthenticated) {
        throw new Error('WhatsApp not initialized. Call initializeWhatsApp() first.');
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

        const result = await checkNumber(phone);
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
 * Close browser
 */
export async function closeWhatsApp() {
    if (browser) {
        await browser.close();
        browser = null;
        page = null;
        isAuthenticated = false;
        console.log('[WhatsApp] Browser closed');
    }
}

/**
 * Get authentication status
 */
export function getAuthStatus() {
    return {
        isAuthenticated,
        browserOpen: !!browser
    };
}
