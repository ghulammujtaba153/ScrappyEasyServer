import express from "express";
import {
  getMailThreads,
  getMailThreadMessages,
  sendMailMessage,
  receiveInboundWebhook,
  migrateThreadIds
} from "../controller/mailMessageController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

// Public webhook endpoint (no auth so Resend can post to it directly)
router.post("/webhook", receiveInboundWebhook);

// Protected endpoints for the admin panel
router.get("/threads", authMiddleware, getMailThreads);
router.get("/thread/:threadId", authMiddleware, getMailThreadMessages);
router.post("/send", authMiddleware, sendMailMessage);

export default router;
