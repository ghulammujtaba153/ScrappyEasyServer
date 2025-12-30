import express from "express";
import authRouter from "./authRoutes.js";
import otpRouter from "./otpRoutes.js";
import dataRouter from "./dataRoutes.js";
import categoryRouter from "./categoryRoutes.js";
// import whatsappRouter from "./whatsappRoutes.js";
import verificationRouter from "./whatsAppVerificationRoutes.js";
import notesRouter from "./notesRoutes.js";
import dashboardRouter from "./dashboardRoutes.js";
import automationRouter from "./automationRoutes.js";
import whatsAppAccountRouter from "./whatsAppAccountRoutes.js";
import packageRouter from "./packageRoutes.js";
import subscriptionRouter from "./subscriptionRoutes.js";
import wappRouter from "./whatsapp.routes.js";
import wappMessageRouter from "./message.routes.js";
import automateMessageRouter from "./automateMessageRoutes.js";
import callRouter from "./callRoutes.js";
import coldCallRouter from "./coldCallRoutes.js";
import userRouter from "./userRoutes.js";
import screenshotRouter from "./screenshotRoutes.js";
import proxyRouter from "./proxyRoutes.js";
import supportRouter from "./supportRoutes.js";
import stripeRouter from "./stripeRoutes.js";
import locationRouter from "./locationRoutes.js";

const router = express.Router();

router.use("/auth", authRouter);
router.use("/otp", otpRouter);
router.use("/data", dataRouter);
router.use("/category", categoryRouter);
// router.use("/whatsapp", whatsappRouter);
router.use("/verification", verificationRouter)
router.use("/notes", notesRouter)
router.use("/dashboard", dashboardRouter)
router.use("/automation", automationRouter);
router.use("/whatsapp/account", whatsAppAccountRouter);
router.use("/packages", packageRouter);
router.use("/subscriptions", subscriptionRouter);
router.use("/whatsapp", wappRouter);
router.use("/message", wappMessageRouter);
router.use("/automate", automateMessageRouter);
router.use("/call", callRouter)
router.use("/coldcall", coldCallRouter);
router.use("/user", userRouter);
router.use("/screenshot", screenshotRouter);
router.use("/proxy", proxyRouter);
router.use("/support", supportRouter);
router.use("/stripe", stripeRouter);
router.use("/location", locationRouter);

export default router;
