import User from "../models/userSchema.js";
import Team from "../models/teamSchema.js";
import { resolvePaymentScreenshot } from "../utils/paymentScreenshot.js";

const hasActiveSubscription = (user) =>
    Boolean(user && user.status === "active" && user.planId);

export const getMyAccessStatus = async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("-password");
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        if (hasActiveSubscription(user)) {
            return res.status(200).json({
                success: true,
                isAuthorized: true,
                canCreateTeam: true,
                isTeamMember: false,
                type: "subscription",
                subscription: user,
            });
        }

        const memberTeams = await Team.find({ members: req.userId }).populate("owner");
        const coveredTeam = memberTeams.find((team) => {
            const ownerId = team.owner?._id?.toString() || team.owner?.toString();
            return ownerId && ownerId !== req.userId.toString() && hasActiveSubscription(team.owner);
        });

        if (coveredTeam) {
            return res.status(200).json({
                success: true,
                isAuthorized: true,
                canCreateTeam: false,
                isTeamMember: true,
                type: "team_subscription",
                subscription: coveredTeam.owner,
                teamId: coveredTeam._id,
                teamName: coveredTeam.name,
            });
        }

        return res.status(200).json({
            success: true,
            isAuthorized: false,
            canCreateTeam: false,
            isTeamMember: memberTeams.length > 0,
            type: "none",
        });
    } catch (error) {
        console.error("Error resolving access status:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

export const updateTwilioConfig = async (req, res) => {
    try {
        const userId = req.userId; // Use req.userId from authMiddleware
        const { accountSid, authToken, apiKeySid, apiKeySecret, twimlAppSid, phoneNumber } = req.body;

        const user = await User.findByIdAndUpdate(
            userId,
            {
                $set: {
                    twilioConfig: {
                        accountSid,
                        authToken,
                        apiKeySid,
                        apiKeySecret,
                        twimlAppSid,
                        phoneNumber
                    }
                }
            },
            { new: true }
        ).select("-password");

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        res.status(200).json({
            success: true,
            message: "Twilio configuration updated successfully",
            data: user.twilioConfig
        });
    } catch (error) {
        console.error("Error updating Twilio config:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

export const getTwilioConfig = async (req, res) => {
    try {
        const userId = req.userId; // Use req.userId
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        res.status(200).json({
            success: true,
            data: user.twilioConfig || {}
        });
    } catch (error) {
        console.error("Error fetching Twilio config:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

export const updateProfile = async (req, res) => {
    try {
        const userId = req.userId;
        const { gender, dob, areaOfInterest } = req.body;

        const user = await User.findByIdAndUpdate(
            userId,
            {
                $set: {
                    gender,
                    dob,
                    areaOfInterest,
                    isProfileComplete: true
                }
            },
            { new: true }
        ).select("-password");

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            data: user
        });
    } catch (error) {
        console.error("Error updating profile:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

export const getUserById = async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findById(userId).select("-password");

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        console.error("Error fetching user:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

export const requestSubscription = async (req, res) => {
    try {
        const { userId } = req.params;
        const { planId, planName, planAmount } = req.body;
        const screenshot = resolvePaymentScreenshot(req);

        if (!screenshot) {
            return res.status(400).json({ success: false, message: "Payment screenshot is required" });
        }

        // Calculate plan expiry if it's a 2-year plan
        let planExpiry = null;
        if (planId === "2-year") {
            const date = new Date();
            date.setFullYear(date.getFullYear() + 2);
            planExpiry = date;
        }

        const user = await User.findByIdAndUpdate(
            userId,
            {
                $set: {
                    status: "under_review",
                    planId,
                    planName,
                    planAmount,
                    paymentScreenshot: screenshot,
                    planExpiry
                }
            },
            { new: true }
        ).select("-password");

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        res.status(200).json({
            success: true,
            message: "Subscription request submitted for review",
            user
        });
    } catch (error) {
        console.error("Error requesting subscription:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};
