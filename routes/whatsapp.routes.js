import { Router } from 'express';
const wappRouter = Router();
import WhatsAppController from '../controller/whatsapp.controller.js';

// Session management
wappRouter.post('/session', WhatsAppController.initializeSession);
wappRouter.get('/session/:sessionId', WhatsAppController.getSessionStatus);
wappRouter.get('/sessions', WhatsAppController.getAllSessions);
wappRouter.delete('/session/:sessionId', WhatsAppController.disconnectSession);
wappRouter.post('/session/:sessionId/logout', WhatsAppController.logoutSession);

// Message sending with specific session
wappRouter.post('/session/:sessionId/send', WhatsAppController.sendMessage);
wappRouter.post('/session/:sessionId/bulk', WhatsAppController.sendBulkMessages);

export default wappRouter;