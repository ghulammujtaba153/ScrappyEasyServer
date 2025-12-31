import User from "../models/userSchema.js";

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
                    areaOfInterest
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
