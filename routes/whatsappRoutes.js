// routes/whatsappRoutes.js
import express from 'express';
import {
    initialize,
    getStatus,
    startVerification,
    getVerificationProgress,
    clearSession,
    closeBrowser
} from '../controller/whatsappController.js';

const router = express.Router();

// Initialize WhatsApp (one-time setup, shows QR code)
router.post('/initialize', initialize);

// Get WhatsApp status
router.get('/status', getStatus);

// Start verification (backend does the work with Puppeteer)
router.post('/verify/:userId', startVerification);

// Get progress (frontend polls this)
router.get('/progress/:sessionId', getVerificationProgress);

// Clear session
router.delete('/session/:sessionId', clearSession);

// Close WhatsApp browser
router.post('/close', closeBrowser);

export default router;
