import express from "express";
import { getDashboardStats, getDashboardChartData } from "../controller/dashboardController.js";


const router = express.Router();

router.get("/stats/:userId", getDashboardStats);
router.get("/charts/:userId", getDashboardChartData);

export default router;
