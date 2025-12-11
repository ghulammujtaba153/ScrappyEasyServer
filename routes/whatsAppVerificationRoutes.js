import express from 'express';
import whatsappController from '../controller/whatsAppVerification.js';
import authMiddleware from '../middleware/authMiddleware.js';

const verificationRouter = express.Router();

// Middleware to validate and filter phone numbers
const validatePhoneNumbers = (req, res, next) => {
    const { phoneNumbers } = req.body;

    if (!phoneNumbers || !Array.isArray(phoneNumbers)) {
        return res.status(400).json({
            success: false,
            error: 'phoneNumbers must be an array'
        });
    }

    if (phoneNumbers.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'phoneNumbers array cannot be empty'
        });
    }

    // Filter out invalid phone numbers instead of rejecting entire request
    const validNumbers = [];
    const invalidNumbers = [];

    for (const number of phoneNumbers) {
        if (typeof number !== 'string' || !number.startsWith('+')) {
            invalidNumbers.push({ number, reason: 'Must start with +' });
            continue;
        }

        const digits = number.replace(/\D/g, '');
        if (digits.length < 10) {
            invalidNumbers.push({ number, reason: 'Must have at least 10 digits' });
            continue;
        }

        validNumbers.push(number);
    }

    // If all numbers are invalid, return error
    if (validNumbers.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'No valid phone numbers provided',
            invalidNumbers
        });
    }

    // Store valid numbers and invalid info for the route handler
    req.validPhoneNumbers = validNumbers;
    req.invalidPhoneNumbers = invalidNumbers;

    next();
};

// Initialize WhatsApp session for user
verificationRouter.post('/initialize', authMiddleware, async (req, res) => {
    try {
        await whatsappController.initializeForUser(req.userId);
        
        res.json({
            success: true,
            message: 'WhatsApp session initialization started. Please check /qr endpoint for QR code.'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Check connection status
verificationRouter.get('/status', authMiddleware, (req, res) => {
    try {
        const status = whatsappController.getStatus(req.userId);

        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get QR code for scanning
verificationRouter.get('/qr', authMiddleware, (req, res) => {
    try {
        const status = whatsappController.getStatus(req.userId);

        if (status.hasQRCode) {
            res.json({
                success: true,
                data: {
                    qrCode: status.qrCode,
                    message: 'Scan this QR code with WhatsApp'
                }
            });
        } else if (status.isConnected) {
            res.json({
                success: true,
                data: {
                    message: 'Already connected to WhatsApp',
                    isConnected: true
                }
            });
        } else {
            res.json({
                success: false,
                error: 'No QR code available yet. Please wait...'
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Check numbers (batch verification)
verificationRouter.post('/check', authMiddleware, validatePhoneNumbers, async (req, res) => {
    try {
        const { operationId } = req.body;
        const validNumbers = req.validPhoneNumbers;
        const invalidNumbers = req.invalidPhoneNumbers;

        // Always use batch method for efficiency with valid numbers only
        const results = await whatsappController.checkMultipleNumbers(req.userId, validNumbers, operationId);

        // Add invalid numbers to results
        const invalidResults = invalidNumbers.map(({ number, reason }) => ({
            phoneNumber: number,
            isRegistered: false,
            whatsappId: null,
            isBusiness: false,
            success: false,
            error: `Invalid format: ${reason}`
        }));

        const allResults = [...results.map(r => ({
            phoneNumber: r.phoneNumber || r.data?.phoneNumber,
            isRegistered: r.data?.isRegistered,
            whatsappId: r.data?.whatsappId,
            isBusiness: r.data?.isBusiness,
            success: r.success,
            error: r.error
        })), ...invalidResults];

        const successResults = allResults.filter(r => r.success);
        const failedResults = allResults.filter(r => !r.success);

        res.json({
            success: true,
            data: {
                total: allResults.length,
                successful: successResults.length,
                failed: failedResults.length,
                invalidCount: invalidNumbers.length,
                results: allResults
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Bulk check with file upload (optional)
verificationRouter.post('/bulk-check', async (req, res) => {
    try {
        // This would handle file upload - implement as needed
        res.json({
            success: false,
            error: 'Bulk check not implemented yet'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Disconnect WhatsApp
verificationRouter.post('/disconnect', authMiddleware, (req, res) => {
    try {
        whatsappController.disconnect(req.userId);

        res.json({
            success: true,
            message: 'WhatsApp disconnected successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default verificationRouter;