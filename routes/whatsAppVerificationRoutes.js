import express from 'express';
import whatsappController from '../controller/whatsAppVerification.js';

const verificationRouter = express.Router();

// Middleware to validate phone numbers
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

    // Validate each phone number format
    for (const number of phoneNumbers) {
        if (typeof number !== 'string' || !number.startsWith('+')) {
            return res.status(400).json({
                success: false,
                error: `Invalid phone number format: ${number}. Must start with +`
            });
        }

        const digits = number.replace(/\D/g, '')
        if (digits.length < 10) {
            return res.status(400).json({
                success: false,
                error: `Invalid phone number: ${number}. Must have at least 10 digits`
            });
        }
    }

    next();
};

// Check connection status
verificationRouter.get('/status', (req, res) => {
    try {
        const status = whatsappController.getStatus();

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
verificationRouter.get('/qr', (req, res) => {
    try {
        const status = whatsappController.getStatus();

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

// Check single number
verificationRouter.post('/check', validatePhoneNumbers, async (req, res) => {
    try {
        const { phoneNumbers } = req.body

        // For single number check
        if (phoneNumbers.length === 1) {
            const result = await whatsappController.checkSingleNumber(phoneNumbers[0]);

            res.json({
                success: result.success,
                data: result.data || null,
                error: result.error || null
            });
        } else {
            // For multiple numbers
            const results = await whatsappController.checkMultipleNumbers(phoneNumbers);

            const successResults = results.filter(r => r.success);
            const failedResults = results.filter(r => !r.success);

            res.json({
                success: true,
                data: {
                    total: results.length,
                    successful: successResults.length,
                    failed: failedResults.length,
                    results: results.map(r => ({
                        phoneNumber: r.phoneNumber || r.data?.phoneNumber,
                        isRegistered: r.data?.isRegistered,
                        whatsappId: r.data?.whatsappId,
                        isBusiness: r.data?.isBusiness,
                        success: r.success,
                        error: r.error
                    }))
                }
            });
        }
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
verificationRouter.post('/disconnect', (req, res) => {
    try {
        whatsappController.disconnect();

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