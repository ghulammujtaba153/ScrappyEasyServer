import Notes from "../models/notesSchema.js";


export const createNote = async (req, res) => {
    try {
        const notes = await Notes.create(req.body);
        res.status(201).json({
            message: "Note created successfully",
            notes
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to create note",
            error: error.message
        });
    }
}


export const getNotes = async (req, res) => {
    try {
        const notes = await Notes.find({ dataId: req.params.id }).sort({ isPinned: -1, createdAt: -1 });
        res.status(200).json(notes);
    } catch (error) {
        res.status(500).json({
            message: "Failed to get notes",
            error: error.message
        });
    }
}


export const updateNote = async (req, res) => {
    try {
        const notes = await Notes.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(notes);
    } catch (error) {
        res.status(500).json({
            message: "Failed to update note",
            error: error.message
        });
    }
}


export const deleteNote = async (req, res) => {
    try {
        const notes = await Notes.findByIdAndDelete(req.params.id);
        res.status(200).json({
            message: "Note deleted successfully",
            notes
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to delete note",
            error: error.message
        });
    }
}