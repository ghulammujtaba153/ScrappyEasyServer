import express from "express";
import { updateTwilioConfig, getTwilioConfig } from "../controller/userController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

router.put("/twilio-config", authMiddleware, updateTwilioConfig);
router.get("/twilio-config", authMiddleware, getTwilioConfig);

export default router;
