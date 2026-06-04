import express from 'express';
import { authMiddleware as auth } from '../middleware/authMiddleware.js';
import * as ctrl from '../controller/coldCampaignController.js';

const router = express.Router();

router.get('/',               auth, ctrl.getCampaigns);
router.get('/:id',            auth, ctrl.getCampaign);
router.post('/',              auth, ctrl.createCampaign);
router.put('/:id',            auth, ctrl.updateCampaign);
router.post('/:id/launch',    auth, ctrl.launchCampaign);
router.post('/:id/pause',     auth, ctrl.pauseCampaign);
router.delete('/:id',         auth, ctrl.deleteCampaign);
router.get('/:id/stats',      auth, ctrl.getCampaignStats);
router.post('/:id/send-now',  auth, ctrl.sendNowCampaign);
export default router;
