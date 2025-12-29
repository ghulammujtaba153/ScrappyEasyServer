import express from 'express';
import { createCheckoutSession, getCheckoutSession } from '../controller/stripeController.js';

const router = express.Router();

// Create checkout session
router.post('/create-checkout-session', createCheckoutSession);

// Get checkout session details
router.get('/session/:sessionId', getCheckoutSession);

export default router;
