import express from "express";
import {
    createColdCall,
    getColdCallsByUser,
    getColdCallById,
    updateColdCall,
    updateCallStatus,
    deleteColdCall
} from "../controller/coldCallController.js";

const router = express.Router();

router.post("/create", createColdCall);
router.get("/all/:userId", getColdCallsByUser);
router.get("/:id", getColdCallById);
router.put("/update/:id", updateColdCall);
router.put("/update-call-status/:id", updateCallStatus);
router.delete("/delete/:id", deleteColdCall);

export default router;
