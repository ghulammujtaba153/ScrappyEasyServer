import express from 'express';
import whatsappController from '../controller/whatsAppVerification.js';

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
verificationRouter.post('/initialize', async (req, res) => {
    try {
        const { userId, forceNew } = req.body;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'userId is required in request body'
            });
        }
        
        await whatsappController.initializeForUser(userId, forceNew || false);

        res.json({
            success: true,
            message: 'WhatsApp session initialization started. Please check /qr endpoint for QR code.'
        });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({
            success: false,
            error: error.message,
            remainingCooldown: error.remainingCooldown
        });
    }
});

// Check connection status
verificationRouter.get('/status', async (req, res) => {
    try {
        const userId = req.query?.userId;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'userId is required'
            });
        }
        
        const status = whatsappController.getStatus(userId);

        // Return current status only
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
verificationRouter.get('/qr', async (req, res) => {
    try {
        const userId = req.query?.userId;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'userId is required'
            });
        }
        
        let status = whatsappController.getStatus(userId);

        // If not initialized or needs reinitialization, start it
        if (!status.initialized || status.needsReinitialization) {
            console.log(`Initializing new session for QR request: ${userId}`);
            await whatsappController.initializeForUser(userId, status.needsReinitialization);

            // Wait a bit for QR to be generated
            await new Promise(resolve => setTimeout(resolve, 2000));
            status = whatsappController.getStatus(userId);
        }

        if (status.isConnected) {
            res.json({
                success: true,
                data: {
                    message: 'Already connected to WhatsApp',
                    isConnected: true
                }
            });
        } else if (status.hasQRCode) {
            res.json({
                success: true,
                data: {
                    qrCode: status.qrCode,
                    message: 'Scan this QR code with WhatsApp'
                }
            });
        } else if (status.isInitializing) {
            res.json({
                success: false,
                error: 'Generating QR code, please wait...',
                isInitializing: true
            });
        } else {
            res.json({
                success: false,
                error: 'No QR code available. Please try again.',
                lastError: status.lastError
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
verificationRouter.post('/check', validatePhoneNumbers, async (req, res) => {
    try {
        const { userId, operationId } = req.body;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'userId is required in request body'
            });
        }
        
        const validNumbers = req.validPhoneNumbers;
        const invalidNumbers = req.invalidPhoneNumbers;

        // Always use batch method for efficiency with valid numbers only
        const results = await whatsappController.checkMultipleNumbers(userId, validNumbers, operationId);

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
verificationRouter.post('/disconnect', (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'userId is required in request body'
            });
        }
        
        whatsappController.disconnect(userId);

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