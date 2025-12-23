import express from "express";
import {
    createColdCall,
    getColdCallsByUser,
    getColdCallById,
    updateColdCall,
    deleteColdCall
} from "../controller/coldCallController.js";

const router = express.Router();

router.post("/create", createColdCall);
router.get("/all/:userId", getColdCallsByUser);
router.get("/:id", getColdCallById);
router.put("/update/:id", updateColdCall);
router.delete("/delete/:id", deleteColdCall);

export default router;
