import express from "express";
import { getAllSubscriptions, createSubscription, getSubscriptionAnalytics } from "../controller/subscriptionController.js";

const router = express.Router();

router.get("/analytics", getSubscriptionAnalytics);
router.get("/", getAllSubscriptions);
router.post("/", createSubscription);

export default router;
