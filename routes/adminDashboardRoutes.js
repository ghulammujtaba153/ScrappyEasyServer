import express from "express";
import {
    getAdminDashboardStats,
    getAdminDashboardData,
    getUserGrowthData,
    getRevenueData,
    getSubscriptionDistribution,
    getUserActivityData,
    getUserDetailsStats,
    getAllSubscriptions,
    getSubscriptionAnalytics
} from "../controller/adminDashboardController.js";
import { authMiddleware, isAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

// Apply authMiddleware and isAdmin to all routes in this router
router.use(authMiddleware, isAdmin);


router.get("/", getAdminDashboardData);


router.get("/stats", getAdminDashboardStats);
router.get("/user-growth", getUserGrowthData);
router.get("/revenue", getRevenueData);
router.get("/subscriptions", getSubscriptionDistribution);
router.get("/subscriptions/list", getAllSubscriptions);
router.get("/subscriptions/analytics", getSubscriptionAnalytics);
router.get("/activity", getUserActivityData);

// User details endpoint
router.get("/user/:userId", getUserDetailsStats);

export default router;
