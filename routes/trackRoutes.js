import express from 'express';
import { trackOpen, trackClick, trackUnsubscribe } from '../controller/trackController.js';

const router = express.Router();

// Public routes — no auth (recipients click these links)
router.get('/open',        trackOpen);
router.get('/click',       trackClick);
router.get('/unsubscribe', trackUnsubscribe);

export default router;
