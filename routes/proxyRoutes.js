import express from 'express';
import { proxyUrl } from '../controller/proxyController.js';

const router = express.Router();

/**
 * GET /api/proxy?url=<target_url>
 * Proxies the target URL and strips security headers
 */
router.get('/', proxyUrl);

export default router;
