import express from "express";
import {
    createOffer,
    getUserOffers,
    getOfferById,
    updateOffer,
    addActivity,
    updateActivity,
    deleteActivity,
    deleteOffer
} from "../controller/offersController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// Create new offer
router.post("/", createOffer);

// Get all user offers
router.get("/", getUserOffers);

// Get single offer by ID
router.get("/:id", getOfferById);

// Update offer
router.put("/:id", updateOffer);

// Add activity to offer
router.post("/:id/activities", addActivity);

// Update activity in offer
router.put("/:id/activities/:activityId", updateActivity);

// Delete activity from offer
router.delete("/:id/activities/:activityId", deleteActivity);

// Delete offer
router.delete("/:id", deleteOffer);

export default router;
