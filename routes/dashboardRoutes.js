import express from "express";
import { getDashboardStats } from "../controller/dashboardControoler.js";


const router = express.Router();

router.get("/stats/:userId", getDashboardStats);

export default router;
