import express from "express";

import { 
    updateTwilioConfig, 
    getTwilioConfig, 
    updateProfile, 
    getUserById,
    getMyAccessStatus,
    requestSubscription
} from "../controller/userController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

router.put("/twilio-config", authMiddleware, updateTwilioConfig);
router.get("/twilio-config", authMiddleware, getTwilioConfig);
router.put("/update-profile", authMiddleware, updateProfile);
router.get("/access-status/me", authMiddleware, getMyAccessStatus);
router.get("/:userId", getUserById);
router.post("/request-subscription/:userId", authMiddleware, requestSubscription);

export default router;
