import express from "express";
import authRouter from "./authRoutes.js";
import otpRouter from "./otpRoutes.js";
import dataRouter from "./dataRoutes.js";
import categoryRouter from "./categoryRoutes.js";

const router = express.Router();

router.use("/auth", authRouter);
router.use("/otp", otpRouter);
router.use("/data", dataRouter);
router.use("/category", categoryRouter);

export default router;
