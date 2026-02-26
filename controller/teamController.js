import Team from "../models/teamSchema.js";
import { sendNotification } from "./notificationController.js";


export const createTeam = async (req, res) => {
    try {
        if (req.body.members && req.body.members.length > 2) {
            return res.status(400).json({ message: "A maximum of 2 sub-accounts is allowed per team." });
        }

        const team = new Team(req.body);
        await team.save();
        
        // Send notifications to all members
        const io = req.app.get('io');
        if (team.members && team.members.length > 0) {
            for (const memberId of team.members) {
                await sendNotification(
                    io,
                    memberId,
                    'Added to Team',
                    `You have been added to the team "${team.name}"`
                );
            }
        }
        
        res.status(201).json(team);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
}


export const getTeams = async (req, res) => {
    try {
        const teams = await Team.find().populate('members').populate('owner');
        res.status(200).json(teams);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
}


export const getTeamById = async (req, res) => {
    try {
        const team = await Team.findById(req.params.id).populate('members').populate('owner');
        res.status(200).json(team);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
}


export const getTeamsByOwner = async (req, res) => {
    try {
        const teams = await Team.find({ owner: req.params.ownerId }).populate('members').populate('owner');
        res.status(200).json(teams);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
}

export const getTeamsByMember = async (req, res) => {
    try {
        const teams = await Team.find({ members: req.params.memberId }).populate('members').populate('owner');
        res.status(200).json(teams);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
}

export const updateTeam = async (req, res) => {
    try {
        // Get the old team to compare members
        const oldTeam = await Team.findById(req.params.id);
        
        if (!oldTeam) {
            return res.status(404).json({ message: "Team not found" });
        }
        
        if (oldTeam.owner.toString() !== req.userId.toString()) {
            return res.status(403).json({ message: "Not authorized to update this team" });
        }
        
        const oldMembers = oldTeam?.members?.map(m => m.toString()) || [];
        const newMembers = req.body.members || [];
        
        if (newMembers.length > 2) {
            return res.status(400).json({ message: "A maximum of 2 sub-accounts is allowed per team." });
        }
        
        const team = await Team.findByIdAndUpdate(req.params.id, req.body, { new: true });
        
        // Send notifications to newly added members
        const io = req.app.get('io');
        const addedMembers = newMembers.filter(m => !oldMembers.includes(m.toString()));
        const removedMembers = oldMembers.filter(m => !newMembers.includes(m));
        
        for (const memberId of addedMembers) {
            await sendNotification(
                io,
                memberId,
                'Added to Team',
                `You have been added to the team "${team.name}"`
            );
        }
        
        // Notify removed members (when someone leaves or is removed)
        for (const memberId of removedMembers) {
            await sendNotification(
                io,
                memberId,
                'Removed from Team',
                `You have been removed from the team "${team.name}"`
            );
        }
        
        // Notify owner when a member leaves the team
        if (removedMembers.length > 0 && team.owner) {
            const User = (await import('../models/userSchema.js')).default;
            for (const memberId of removedMembers) {
                const member = await User.findById(memberId);
                const memberName = member?.name || member?.email || 'A member';
                await sendNotification(
                    io,
                    team.owner.toString(),
                    'Member Left Team',
                    `${memberName} has left the team "${team.name}"`
                );
            }
        }
        
        res.status(200).json(team);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
}


export const deleteTeam = async (req, res) => {
    try {
        const team = await Team.findById(req.params.id);
        
        if (!team) {
            return res.status(404).json({ message: "Team not found" });
        }
        
        if (team.owner.toString() !== req.userId.toString()) {
            return res.status(403).json({ message: "Not authorized to delete this team" });
        }
        
        await Team.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Team deleted successfully" });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
}