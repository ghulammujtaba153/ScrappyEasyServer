import express from 'express';
import { authMiddleware as auth } from '../middleware/authMiddleware.js';
import * as ctrl from '../controller/emailAccountController.js';

const router = express.Router();

router.get('/',                          auth, ctrl.getAccounts);
router.get('/oauth/gmail',               auth, ctrl.gmailAuthUrl);
router.get('/oauth/callback',                  ctrl.gmailCallback);  // no auth — Google redirects here
router.post('/smtp',                     auth, ctrl.addSmtp);
router.delete('/:id',                    auth, ctrl.deleteAccount);
router.patch('/:id/warmup',              auth, ctrl.toggleWarmup);

export default router;
