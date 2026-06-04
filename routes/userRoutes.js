import express from "express";

import { 
    updateTwilioConfig, 
    getTwilioConfig, 
    updateProfile, 
    getUserById,
    requestSubscription
} from "../controller/userController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

router.put("/twilio-config", authMiddleware, updateTwilioConfig);
router.get("/twilio-config", authMiddleware, getTwilioConfig);
router.put("/update-profile", authMiddleware, updateProfile);
router.get("/:userId", getUserById);
router.post("/request-subscription/:userId", authMiddleware, requestSubscription);

export default router;
