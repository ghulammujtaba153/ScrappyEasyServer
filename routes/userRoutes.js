import express from "express";
import multer from "multer";

import { 
    updateTwilioConfig, 
    getTwilioConfig, 
    updateProfile, 
    getUserById,
    requestSubscription
} from "../controller/userController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/screenshots')
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, file.fieldname + '-' + uniqueSuffix + '-' + file.originalname)
    }
});

const upload = multer({ storage: storage });
const router = express.Router();

router.put("/twilio-config", authMiddleware, updateTwilioConfig);
router.get("/twilio-config", authMiddleware, getTwilioConfig);
router.put("/update-profile", authMiddleware, updateProfile);
router.get("/:userId", getUserById);
router.post("/request-subscription/:userId", authMiddleware, upload.single("screenshot"), requestSubscription);

export default router;
