import express from "express";
import { 
    createCampaign, 
    getCampaigns, 
    getCampaignById, 
    updateCampaign, 
    deleteCampaign,
    sendCampaign,
    previewCampaign
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

export default router;
