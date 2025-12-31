import Collaboration from "../models/collaborationSchema.js";

export const createCollaboration = async (req, res) => {
    try {
        const collaboration = new Collaboration(req.body);
        await collaboration.save();
        res.status(201).json({ success: true, data: collaboration });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}


export const getCollaborationsByUser = async (req, res) => {
    try {
        const userId = req.params.userId;
        const collaborations = await Collaboration.find({ participants: userId })
            .sort({ createdAt: -1 })
            .populate('participants', 'name email');
        res.status(200).json({ success: true, data: collaborations });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}

export const updateCollaboration = async (req, res) => {
    try {
        const collaboration = await Collaboration.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json({ success: true, data: collaboration });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}



export const deleteCollaboration = async (req, res) => {
    try {
        const collaboration = await Collaboration.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, data: collaboration });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}