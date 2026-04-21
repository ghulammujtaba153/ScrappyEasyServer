import express from "express";
import { extractSocialsValidation, extractSocials, bulkExtractSocials } from "../controller/socialMediaController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(authMiddleware);

router.post("/extract", extractSocialsValidation, extractSocials);
router.post("/bulk-extract", bulkExtractSocials);

export default router;
