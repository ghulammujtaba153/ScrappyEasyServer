import express from 'express';
import { analyzeStack } from '../controller/stackAnalysisController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/analyze', authMiddleware, analyzeStack);

export default router;
