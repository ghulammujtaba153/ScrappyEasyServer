import crypto from "crypto";
import Team from "../models/teamSchema.js";
import User from "../models/userSchema.js";
import { emailApi } from "../utils/mailer.js";
import { sendNotification } from "./notificationController.js";

const MAX_MEMBERS = 2;

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
            await emailApi.sendTransacEmail({
                subject: `Invitation to join team "${teamName}"`,
                sender: { name: "Scraper Dashboard", email: process.env.BREVO_SENDER_EMAIL || "no-reply@scraper.com" },
                to: [{ email: user.email }],
                htmlContent: `
                    <div style="font-family: sans-serif; padding: 20px; color: #333;">
                        <h2>Welcome!</h2>
                        <p>${senderName} has invited you to join their team <strong>"${teamName}"</strong> on our platform.</p>
                        <p>To accept this invitation and set up your account, please click the link below:</p>
                        <a href="${process.env.FRONTEND_URL}/invite/confirm?token=${token}" style="display: inline-block; padding: 10px 20px; background-color: #0F792C; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px;">Join Team</a>
                        <p style="margin-top: 30px; font-size: 12px; color: #777;">This link will expire in 7 days.</p>
                    </div>
                `
            }).catch(err => console.error("Invite email fail:", err));
        }
    }
    return memberIds;
};

export const createTeam = async (req, res) => {
    try {
        const { name, owner, memberEmails = [] } = req.body;

        if (memberEmails.length > MAX_MEMBERS) {
            return res.status(400).json({ message: `A maximum of ${MAX_MEMBERS} sub-accounts is allowed per team.` });
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
        const { name, memberEmails = [] } = req.body;
        const oldTeam = await Team.findById(req.params.id);
        
        if (!oldTeam) {
            return res.status(404).json({ message: "Team not found" });
        }
        
        if (oldTeam.owner.toString() !== req.userId.toString()) {
            return res.status(403).json({ message: "Not authorized to update this team" });
        }
        
        if (memberEmails.length > MAX_MEMBERS) {
            return res.status(400).json({ message: `A maximum of ${MAX_MEMBERS} sub-accounts is allowed per team.` });
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
