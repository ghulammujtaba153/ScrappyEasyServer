import express from "express";
import { extractEmailsValidation, extractEmails, bulkExtractEmails } from "../controller/mailController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(authMiddleware);

router.post("/extract", extractEmailsValidation, extractEmails);
router.post("/bulk-extract", bulkExtractEmails);

export default router;
