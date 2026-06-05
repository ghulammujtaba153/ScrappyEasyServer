import crypto from "crypto";
import Team from "../models/teamSchema.js";
import User from "../models/userSchema.js";
import { sendMail } from "../utils/mailer.js";
import { sendNotification } from "./notificationController.js";
import { getTeamInviteTemplate, getTeamInviteText } from "../utils/templates/teamInvite.js";
import { sendMetaCAPIEvent } from "../utils/metaPixel.js";

const MAX_MEMBERS = 1;

// Helper to handle member invitations/additions
const processTeamMembers = async (emails, ownerId, teamName, req, oldMemberIds = []) => {
    const memberIds = [];
    const io = req.app.get('io');
    const senderName = req.user?.name || "Team Owner";

    for (const email of emails.slice(0, MAX_MEMBERS)) {
        let user = await User.findOne({ email });

        if (user) {
            memberIds.push(user._id);

            // Only notify if not already a member
            if (!oldMemberIds.some(id => id.toString() === user._id.toString())) {
                // Notify via in-app notification only
                await sendNotification(
                    io,
                    user._id,
                    'Added to Team',
                    `You have been added to the team "${teamName}" by ${senderName}`
                );
            }
        } else {
            // New user, create placeholder and invite
            const token = crypto.randomBytes(32).toString('hex');
            user = await User.create({
                email,
                password: crypto.randomBytes(16).toString('hex'), // temp password
                status: 'invited',
                invitationToken: token,
                invitationTokenExpires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
                country: 'N/A', // Placeholders
                aboutUser: 'Invited via team'
            });

            memberIds.push(user._id);

            // Send invitation email
            const inviteLink = `${process.env.FRONTEND_URL}/invite/confirm?token=${token}`;
            await sendMail({
                to: user.email,
                subject: `Invitation to join team "${teamName}"`,
                html: getTeamInviteTemplate(senderName, teamName, inviteLink),
                text: getTeamInviteText(senderName, teamName, inviteLink),
            }).catch(err => console.error("Invite email fail:", err));

            // Track CAPI event for Invitation (using owner's info as the source of action)
            try {
                const owner = await User.findById(ownerId);
                if (owner) {
                    sendMetaCAPIEvent('Contact', owner, {
                        content_name: 'Team Invitation Sent',
                        content_category: 'Collaboration'
                    }, req);
                }
            } catch (capiErr) {
                console.error("CAPI error in team invite:", capiErr);
            }
        }
    }
    return memberIds;
};

export const createTeam = async (req, res) => {
    try {
        const { name, owner, memberEmails = [] } = req.body;

        const existingMembership = await Team.findOne({
            members: req.userId,
            owner: { $ne: req.userId },
        });
        if (existingMembership) {
            return res.status(403).json({
                message: "Invited members cannot create their own team.",
            });
        }

        if (memberEmails.length > MAX_MEMBERS) {
            return res.status(400).json({ message: `You can invite only ${MAX_MEMBERS} member at a time.` });
        }

        // Process members (create/notify/invite)
        const members = await processTeamMembers(memberEmails, owner, name, req, []);

        const team = new Team({
            name,
            owner,
            members
        });
        await team.save();
        
        res.status(201).json(team);
    } catch (error) {
        console.error("Create team error:", error);
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
        const team = await Team.findById(req.params.id)
            .populate('members')
            .populate('owner')
            .populate({
                path: 'leads',
                populate: {
                    path: 'lead'
                }
            });
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
        const { name, memberEmails = [] } = req.body;
        const oldTeam = await Team.findById(req.params.id);
        
        if (!oldTeam) {
            return res.status(404).json({ message: "Team not found" });
        }
        
        if (oldTeam.owner.toString() !== req.userId.toString()) {
            return res.status(403).json({ message: "Not authorized to update this team" });
        }
        
        if (memberEmails.length > MAX_MEMBERS) {
            return res.status(400).json({ message: `You can invite only ${MAX_MEMBERS} member at a time.` });
        }
        
        // Logic for updates: we can simplify by processing all emails again
        // Users who were already in members won't get duplicate invitations due to User.findOne check logic in processTeamMembers
        // and we avoid re-notifying them by passing the old member IDs.
        const members = await processTeamMembers(memberEmails, oldTeam.owner, name || oldTeam.name, req, oldTeam.members);
        
        const team = await Team.findByIdAndUpdate(req.params.id, 
            { name: name || oldTeam.name, members }, 
            { new: true }
        ).populate('members');
        
        res.status(200).json(team);
    } catch (error) {
        console.error("Update team error:", error);
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
