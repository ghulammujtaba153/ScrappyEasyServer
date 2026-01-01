import express from "express";
import { getAllSubscriptions, createSubscription, getSubscriptionAnalytics, getUserSubscription } from "../controller/subscriptionController.js";


const router = express.Router();

router.get("/analytics", getSubscriptionAnalytics);
router.get("/my-subscription/:id", getUserSubscription);
router.get("/", getAllSubscriptions);
router.post("/", createSubscription);

export default router;
