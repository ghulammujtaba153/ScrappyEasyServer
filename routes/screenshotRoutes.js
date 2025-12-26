import express from 'express';
import { captureScreenshot } from '../controller/screenshotController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/capture', authMiddleware, captureScreenshot);

export default router;
