import express from "express"
import { generateOtp, verifyOtp } from "../controller/otpController.js";

const otpRouter = express.Router();

otpRouter.post("/generate", generateOtp);
otpRouter.post("/verify", verifyOtp);

export default otpRouter;
