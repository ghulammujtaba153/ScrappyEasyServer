

import express from "express";
import { embeddedSignupCallback, getConnectedAccount, sendMessage } from "../controller/whatsAppAccountController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const whatsAppAccountRouter = express.Router();

// Public/Callback route (Handles its own auth via state param)
whatsAppAccountRouter.get("/callback", embeddedSignupCallback);

// Protected routes
whatsAppAccountRouter.get("/connected", authMiddleware, getConnectedAccount);
whatsAppAccountRouter.post("/send", authMiddleware, sendMessage);

export default whatsAppAccountRouter;