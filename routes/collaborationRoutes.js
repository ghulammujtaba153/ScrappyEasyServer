import express from "express";
import { createCollaboration, getCollaborationsByUser, updateCollaboration, deleteCollaboration } from "../controller/collaborationController.js";

const collaborationRouter = express.Router();

collaborationRouter.post("/", createCollaboration);
collaborationRouter.get("/user/:userId", getCollaborationsByUser);
collaborationRouter.put("/:id", updateCollaboration);
collaborationRouter.delete("/:id", deleteCollaboration);

export default collaborationRouter;