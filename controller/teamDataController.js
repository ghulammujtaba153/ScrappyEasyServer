import TeamData from "../models/teamDataSchema.js";
import Team from "../models/teamSchema.js";
import { sendNotification } from "./notificationController.js";

// Helper function to notify all team members except the actor
const notifyTeamMembers = async (io, teamId, actorId, actorName, title, description) => {
    try {
        const team = await Team.findById(teamId).populate('owner members');
        if (!team) return;

        // Collect all team members (owner + members) except the actor
        const allMembers = [];
        
        // Add owner if not the actor
        if (team.owner && team.owner._id.toString() !== actorId.toString()) {
            allMembers.push(team.owner._id.toString());
        }
        
        // Add members who are not the actor
        if (team.members && team.members.length > 0) {
            team.members.forEach(member => {
                if (member._id.toString() !== actorId.toString()) {
                    allMembers.push(member._id.toString());
                }
            });
        }

        // Send notification to each member
        for (const memberId of allMembers) {
            await sendNotification(io, memberId, title, description);
        }
    } catch (error) {
        console.error('Error notifying team members:', error);
    }
};


export const createTeamData = async(req, res) => {
    try {
        const teamData = new TeamData(req.body);
        await teamData.save();
        
        // Notify all team members
        const io = req.app.get('io');
        const team = await Team.findById(req.body.team);
        const User = (await import('../models/userSchema.js')).default;
        const actor = await User.findById(req.body.user);
        const actorName = actor?.name || actor?.email || 'A team member';
        
        await notifyTeamMembers(
            io,
            req.body.team,
            req.body.user,
            actorName,
            'New Data Added',
            `${actorName} added new data "${teamData.title || teamData.phone}" in team "${team?.name}"`
        );
        
        res.status(201).json(teamData);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

export const assignLeadToTeam = async (req, res) => {
    try {
        const { teamId, userId, leadId } = req.body;
        
        // Check if already assigned
        const existingAssignment = await TeamData.findOne({ team: teamId, lead: leadId });
        if (existingAssignment) {
            return res.status(400).json({ error: "This lead is already assigned to this team" });
        }

        const LeadData = (await import('../models/leadDataSchema.js')).default;
        const originalLead = await LeadData.findById(leadId);

        const teamData = new TeamData({
            team: teamId,
            user: userId,
            lead: leadId,
            title: originalLead?.title || "",
            phone: originalLead?.phone ? [{ title: "Primary", number: originalLead.phone }] : [],
            link: originalLead?.googleMapsLink || originalLead?.website || "",
            whatsappStatus: originalLead?.whatsappStatus === 'verified' ? 'verified' : 'not-checked',
            status: "new"
        });

        await teamData.save();

        // Notify team
        const io = req.app.get('io');
        const team = await Team.findById(teamId);
        const User = (await import('../models/userSchema.js')).default;
        const actor = await User.findById(userId);
        const actorName = actor?.name || actor?.email || 'A team member';

        await notifyTeamMembers(
            io,
            teamId,
            userId,
            actorName,
            'Lead Assigned to Team',
            `${actorName} assigned lead "${teamData.title || leadId}" to team "${team?.name}"`
        );

        res.status(201).json(teamData);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

export const bulkAssignLeadsToTeam = async (req, res) => {
    try {
        const { teamId, userId, leadIds } = req.body;

        if (!Array.isArray(leadIds) || leadIds.length === 0) {
            return res.status(400).json({ error: "No leads provided" });
        }

        const LeadData = (await import('../models/leadDataSchema.js')).default;
        const User = (await import('../models/userSchema.js')).default;
        
        // Find leads not already assigned to this team
        const existingAssignments = await TeamData.find({ 
            team: teamId, 
            lead: { $in: leadIds } 
        }).select('lead');
        
        const existingLeadIds = existingAssignments.map(a => a.lead.toString());
        const leadsToAssign = leadIds.filter(id => !existingLeadIds.includes(id.toString()));

        if (leadsToAssign.length === 0) {
            return res.status(200).json({ 
                success: true, 
                message: "All leads were already assigned to this team",
                count: 0
            });
        }

        const originalLeads = await LeadData.find({ _id: { $in: leadsToAssign } });
        
        const teamDataEntries = originalLeads.map(lead => ({
            team: teamId,
            user: userId,
            lead: lead._id,
            title: lead.title || "",
            phone: lead.phone ? [{ title: "Primary", number: lead.phone }] : [],
            link: lead.googleMapsLink || lead.website || "",
            whatsappStatus: lead.whatsappStatus === 'verified' ? 'verified' : 'not-checked',
            status: "new"
        }));

        const inserted = await TeamData.insertMany(teamDataEntries);

        // Notify team
        const io = req.app.get('io');
        const team = await Team.findById(teamId);
        const actor = await User.findById(userId);
        const actorName = actor?.name || actor?.email || 'A team member';

        await notifyTeamMembers(
            io,
            teamId,
            userId,
            actorName,
            'Leads Assigned to Team',
            `${actorName} assigned ${inserted.length} leads to team "${team?.name}"`
        );

        res.status(201).json({
            success: true,
            message: `Successfully assigned ${inserted.length} leads to team`,
            count: inserted.length
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}


export const getTeamDataByTeamId = async(req, res) => {
    try {
        const teamData = await TeamData.find({ team: req.params.teamId })
            .populate('user', 'name email')
            .sort({ createdAt: -1 });
        res.status(200).json(teamData);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

export const updateTeamData = async(req, res) => {
    try {
        // Get existing data to find team info
        const existingData = await TeamData.findById(req.params.id);
        
        const teamData = await TeamData.findByIdAndUpdate(req.params.id, req.body, { new: true });
        
        // Notify all team members if we have team info
        if (existingData?.team) {
            const io = req.app.get('io');
            const team = await Team.findById(existingData.team);
            const User = (await import('../models/userSchema.js')).default;
            const actorId = req.body.user || existingData.user;
            const actor = await User.findById(actorId);
            const actorName = actor?.name || actor?.email || 'A team member';
            
            await notifyTeamMembers(
                io,
                existingData.team,
                actorId,
                actorName,
                'Data Updated',
                `${actorName} updated data "${teamData.title || teamData.phone}" in team "${team?.name}"`
            );
        }
        
        res.status(200).json(teamData);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

export const deleteTeamData = async(req, res) => {
    try {
        // Get data before deleting to access team and user info
        const existingData = await TeamData.findById(req.params.id);
        
        const teamData = await TeamData.findByIdAndDelete(req.params.id);
        
        // Notify all team members
        if (existingData?.team) {
            const io = req.app.get('io');
            const team = await Team.findById(existingData.team);
            const User = (await import('../models/userSchema.js')).default;
            const actorId = existingData.user;
            const actor = await User.findById(actorId);
            const actorName = actor?.name || actor?.email || 'A team member';
            
            await notifyTeamMembers(
                io,
                existingData.team,
                actorId,
                actorName,
                'Data Deleted',
                `${actorName} deleted data "${existingData.title || existingData.phone}" in team "${team?.name}"`
            );
        }
        
        res.status(200).json(teamData);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

export const bulkUpdateTeamData = async(req, res) => {
    try {
        const { updates } = req.body;

        // Validate input
        if (!Array.isArray(updates) || updates.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'updates must be a non-empty array'
            });
        }

        // Validate each update has required fields
        for (const update of updates) {
            if (!update.id || !update.data) {
                return res.status(400).json({
                    success: false,
                    error: 'Each update must have "id" and "data" fields'
                });
            }
        }

        const results = [];
        const errors = [];

        // Update each record
        for (const update of updates) {
            try {
                const updatedData = await TeamData.findByIdAndUpdate(
                    update.id,
                    update.data,
                    { new: true }
                );

                if (updatedData) {
                    results.push({
                        id: update.id,
                        success: true,
                        data: updatedData
                    });
                } else {
                    errors.push({
                        id: update.id,
                        success: false,
                        error: 'Record not found'
                    });
                }
            } catch (error) {
                errors.push({
                    id: update.id,
                    success: false,
                    error: error.message
                });
            }
        }

        res.status(200).json({
            success: true,
            message: `Updated ${results.length} records. ${errors.length} failed.`,
            data: {
                total: updates.length,
                successful: results.length,
                failed: errors.length,
                results,
                errors: errors.length > 0 ? errors : undefined
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}