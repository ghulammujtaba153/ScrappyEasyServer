import express from "express";
import authRouter from "./authRoutes.js";
import otpRouter from "./otpRoutes.js";
import dataRouter from "./dataRoutes.js";
import categoryRouter from "./categoryRoutes.js";
import whatsappRouter from "./whatsappRoutes.js";
import verificationRouter from "./whatsAppVerificationRoutes.js";
import notesRouter from "./notesRoutes.js";
import dashboardRouter from "./dashboardRoutes.js";

const router = express.Router();

router.use("/auth", authRouter);
router.use("/otp", otpRouter);
router.use("/data", dataRouter);
router.use("/category", categoryRouter);
router.use("/whatsapp", whatsappRouter);
router.use("/verification", verificationRouter)
router.use("/notes", notesRouter)
router.use("/dashboard", dashboardRouter)

export default router;
