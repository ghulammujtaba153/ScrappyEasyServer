import express from "express";
import { createNote, deleteNote, getNotes, updateNote } from "../controller/notesController.js";

const notesRouter = express.Router();

notesRouter.post("/create", createNote)
notesRouter.get("/:id", getNotes);
notesRouter.put("/:id", updateNote);
notesRouter.delete("/:id", deleteNote);

export default notesRouter;