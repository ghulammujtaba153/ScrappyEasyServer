import express from "express";
import {
    createSupportRequest,
    getUserSupportRequests,
    getAllSupportRequests,
    updateSupportStatus
} from "../controller/supportController.js";

const router = express.Router();

// Create support request (authenticated users)
router.post("/", createSupportRequest);

// Get user's support requests (authenticated users)
router.get("/user", getUserSupportRequests);

// Get all support requests (admin only - add admin middleware if needed)
router.get("/all", getAllSupportRequests);

// Update support request status (admin only - add admin middleware if needed)
router.patch("/:id/status", updateSupportStatus);

export default router;
