import express from "express";
import { 
    createCampaign, 
    getCampaigns, 
    getCampaignById, 
    updateCampaign, 
    deleteCampaign,
    sendCampaign,
    previewCampaign,
    debugCampaign,
    resetCampaign
} from "../controller/campaignController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(authMiddleware);

router.post("/", createCampaign);
router.get("/", getCampaigns);
router.post("/preview", previewCampaign);
router.get("/:id", getCampaignById);
router.put("/:id", updateCampaign);
router.delete("/:id", deleteCampaign);
router.post("/:id/send", sendCampaign);
router.get("/:id/debug", debugCampaign);   // inspect all recipients + errors
router.post("/:id/reset", resetCampaign);  // reset stuck campaign back to Draft

export default router;
