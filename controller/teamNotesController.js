import TeamNotes from "../models/teamNotesSchema.js";
import Team from "../models/teamSchema.js";

export const createTeamNote = async (req, res) => {
    try {
        const { teamId, title, content, color, tags, isPinned } = req.body;
        const userId = req.user?._id || req.user?.id || req.body.userId;

        if (!teamId || !content) {
            return res.status(400).json({ success: false, message: "Team ID and content are required" });
        }

        const newNote = new TeamNotes({
            teamId,
            userId,
            title: title || "Untitled Note",
            content,
            color: color || "#ffffff",
            tags: tags || [],
            isPinned: isPinned || false,
            lastEditedBy: userId
        });

        await newNote.save();
        
        // Populate user details for the response
        await newNote.populate('userId', 'name email');
        
        res.status(201).json({ success: true, data: newNote });
    } catch (error) {
        console.error("Create team note error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getTeamNotes = async (req, res) => {
    try {
        const { teamId } = req.params;
        const notes = await TeamNotes.find({ teamId })
            .populate('userId', 'name email')
            .populate('lastEditedBy', 'name email')
            .sort({ isPinned: -1, updatedAt: -1 });

        res.status(200).json({ success: true, data: notes });
    } catch (error) {
        console.error("Get team notes error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateTeamNote = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content, color, tags, isPinned } = req.body;
        const userId = req.user?._id || req.user?.id || req.body.userId;

        const updatedNote = await TeamNotes.findByIdAndUpdate(
            id,
            { 
                title, 
                content, 
                color, 
                tags, 
                isPinned,
                lastEditedBy: userId
            },
            { new: true }
        ).populate('userId', 'name email').populate('lastEditedBy', 'name email');

        if (!updatedNote) {
            return res.status(404).json({ success: false, message: "Note not found" });
        }

        res.status(200).json({ success: true, data: updatedNote });
    } catch (error) {
        console.error("Update team note error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteTeamNote = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedNote = await TeamNotes.findByIdAndDelete(id);

        if (!deletedNote) {
            return res.status(404).json({ success: false, message: "Note not found" });
        }

        res.status(200).json({ success: true, message: "Note deleted successfully" });
    } catch (error) {
        console.error("Delete team note error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const togglePinNote = async (req, res) => {
    try {
        const { id } = req.params;
        const note = await TeamNotes.findById(id);
        
        if (!note) {
            return res.status(404).json({ success: false, message: "Note not found" });
        }

        note.isPinned = !note.isPinned;
        await note.save();

        res.status(200).json({ success: true, data: note });
    } catch (error) {
        console.error("Toggle pin note error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};
