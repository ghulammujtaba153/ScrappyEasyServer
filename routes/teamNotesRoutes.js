import express from "express";
import { 
    createTeamNote, 
    getTeamNotes, 
    updateTeamNote, 
    deleteTeamNote, 
    togglePinNote 
} from "../controller/teamNotesController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/create", authMiddleware, createTeamNote);
router.get("/get/:teamId", authMiddleware, getTeamNotes);
router.put("/update/:id", authMiddleware, updateTeamNote);
router.delete("/delete/:id", authMiddleware, deleteTeamNote);
router.patch("/pin/:id", authMiddleware, togglePinNote);

export default router;
