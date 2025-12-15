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

export default router;
