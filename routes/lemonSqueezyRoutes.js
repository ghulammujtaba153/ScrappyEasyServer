import express from 'express';
import { createCheckout, LemonSqueezyWebhook } from '../controller/LemonSqueezyController.js';

const router = express.Router();

// Create checkout session
router.post('/create-checkout', createCheckout);

// Webhook for Lemon Squeezy
router.post('/webhook', LemonSqueezyWebhook);

export default router;
