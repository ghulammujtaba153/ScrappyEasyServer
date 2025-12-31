import Collaboration from "../models/collaborationSchema.js";
import mongoose from "mongoose";

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
        
        // Convert string userId to ObjectId for proper matching in array
        const userObjectId = new mongoose.Types.ObjectId(userId);
        
        // Find all collaborations where user is a participant
        const collaborations = await Collaboration.find({ 
            participants: { $in: [userObjectId] } 
        })
            .sort({ createdAt: -1 })
            .populate('participants', 'name email');
        
        // Add "sentByYou" flag - first participant is always the sender
        const collaborationsWithDirection = collaborations.map(collab => {
            const collabObj = collab.toObject();
            const senderId = collab.participants[0]?._id?.toString() || collab.participants[0]?.toString();
            collabObj.sentByYou = senderId === userId;
            collabObj.direction = senderId === userId ? 'sent' : 'received';
            return collabObj;
        });
        
        res.status(200).json({ success: true, data: collaborationsWithDirection });
    } catch (error) {
        console.error('Error fetching collaborations:', error);
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