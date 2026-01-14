import express from "express";
import { getTrialStatus, checkAccessStatus } from "../controller/trialController.js";

const router = express.Router();

router.get("/status/:userId", getTrialStatus);
router.get("/check/:userId", checkAccessStatus);

export default router;
