import { Router } from 'express';
const wappMessageRouter = Router();
import messageController from '../controller/message.controller.js';

// Message sending (auto session management)
wappMessageRouter.post('/send', messageController.sendDirectMessage);
wappMessageRouter.post('/bulk', messageController.sendDirectBulkMessages);

// Number verification
wappMessageRouter.post('/check/:sessionId', messageController.checkNumber);

export default wappMessageRouter;