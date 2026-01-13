// controllers/message.controller.js
import whatsappService from '../services/whatsapp.service.js';
import { validateMessageRequest } from '../utils/validators.js';

class MessageController {
    /**
     * Send message with dynamic session selection
     */
    async sendDirectMessage(req, res, next) {
        try {
            const { to, message, sessionId = 'default', mentions } = req.body;

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
     * Send bulk messages with dynamic session selection
     */
    async sendDirectBulkMessages(req, res, next) {
        try {
            const { recipients, message, sessionId = 'default', options = {} } = req.body;

            if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Recipients array is required and must not be empty'
                });
            }

            if (!message || typeof message !== 'string') {
                return res.status(400).json({
                    success: false,
                    message: 'Message text is required'
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
     * Check if a number is on WhatsApp
     */
    async checkNumber(req, res, next) {
        try {
            const { sessionId = 'default' } = req.params;
            const { number } = req.body;

            if (!number) {
                return res.status(400).json({
                    success: false,
                    message: 'Phone number is required'
                });
            }

            // Validate session
            const session = whatsappService.getSessionStatus(sessionId);
            if (!session || !session.connected) {
                return res.status(400).json({
                    success: false,
                    message: `Session "${sessionId}" is not connected`
                });
            }

            const jid = number.includes('@') ? number : `${number}@s.whatsapp.net`;

            // Note: In the service, we already check if number exists when sending
            // This is a placeholder - you'd need to expose this functionality from service
            res.status(200).json({
                success: true,
                data: {
                    number,
                    exists: true, // Placeholder
                    message: 'Number check functionality needs to be implemented in service'
                }
            });
        } catch (error) {
            next(error);
        }
    }
}

export default new MessageController();