import express from "express";
import { 
    getAdminDashboardStats,
    getAdminDashboardData,
    getUserGrowthData,
    getRevenueData,
    getSubscriptionDistribution,
    getUserActivityData,
    getUserDetailsStats
} from "../controller/adminDashboardController.js";

const router = express.Router();

// Get all dashboard data in one call (recommended)
router.get("/", getAdminDashboardData);

// Individual endpoints
router.get("/stats", getAdminDashboardStats);
router.get("/user-growth", getUserGrowthData);
router.get("/revenue", getRevenueData);
router.get("/subscriptions", getSubscriptionDistribution);
router.get("/activity", getUserActivityData);

// User details endpoint
router.get("/user/:userId", getUserDetailsStats);

export default router;
