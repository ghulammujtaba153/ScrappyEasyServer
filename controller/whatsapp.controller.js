// controllers/whatsapp.controller.js
import whatsappService from '../services/whatsapp.service.js';
import { validateMessageRequest, validateBulkMessageRequest } from '../utils/validators.js';

class WhatsAppController {
    /**
     * Initialize a new WhatsApp session
     */
    async initializeSession(req, res, next) {
        try {
            const { sessionId = 'default' } = req.body;

            const result = await whatsappService.initializeSession(sessionId);

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get session status
     */
    async getSessionStatus(req, res, next) {
        try {
            const { sessionId = 'default' } = req.params;

            const status = whatsappService.getSessionStatus(sessionId);

            if (!status) {
                return res.status(404).json({
                    success: false,
                    message: `Session "${sessionId}" not found`
                });
            }

            res.status(200).json({
                success: true,
                data: status
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get all sessions
     */
    async getAllSessions(req, res, next) {
        try {
            const sessions = whatsappService.getAllSessions();

            res.status(200).json({
                success: true,
                data: {
                    total: sessions.length,
                    sessions
                }
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Send a single message
     */
    async sendMessage(req, res, next) {
        try {
            const { sessionId = 'default' } = req.params;
            const { to, message, mentions } = req.body;

            // Validate request
            const validation = validateMessageRequest(req.body);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: validation.errors
                });
            }

            const content = {
                text: message,
                ...(mentions && { mentions })
            };

            const result = await whatsappService.sendMessage(sessionId, to, content);

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Send bulk messages
     */
    async sendBulkMessages(req, res, next) {
        try {
            const { sessionId = 'default' } = req.params;
            const { recipients, message, options = {} } = req.body;

            // Validate request
            const validation = validateBulkMessageRequest(req.body);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: validation.errors
                });
            }

            const content = { text: message };
            const sendOptions = {
                delayBetweenMessages: options.delayBetweenMessages || 1000,
                delayBetweenBatches: options.delayBetweenBatches || 5000,
                batchSize: options.batchSize || 10
            };

            const result = await whatsappService.sendBulkMessages(
                sessionId,
                recipients,
                content,
                sendOptions
            );

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Disconnect session
     */
    async disconnectSession(req, res, next) {
        try {
            const { sessionId = 'default' } = req.params;

            const result = await whatsappService.disconnectSession(sessionId);

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Logout and clear session
     */
    async logoutSession(req, res, next) {
        try {
            const { sessionId = 'default' } = req.params;

            const result = await whatsappService.logoutSession(sessionId);

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }
}

export default new WhatsAppController();