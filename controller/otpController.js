import Otp from "../models/otpSchema.js";
import User from "../models/userSchema.js";
import { sendMail } from "../utils/mailer.js";
import { getOtpEmailTemplate, getOtpEmailText } from "../utils/templates/otp.js";

export const generateOtp = async (req, res) => {
    console.log(`🔑 Generating OTP for email: ${req.body.email}`);
    try {
        const { email, registration } = req.body;

        // Validate email
        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        // Check if user exists during registration
        let user = null;
        if (registration) {
            user = await User.findOne({ email });
            if (user) {
                return res.status(400).json({ message: "User already exists" });
            }
        } else {
            // For login/password reset, get user info if exists
            user = await User.findOne({ email });
        }

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000);

        // Check if OTP already exists for this email
        const oldOtpData = await Otp.findOne({ email });
        if (oldOtpData) {
            oldOtpData.otp = otp;
            await oldOtpData.save();
        } else {
            // Create new OTP
            await Otp.create({ email, otp });
        }

        // Respond immediately so the frontend does not wait on SMTP latency or timeouts.
        res.status(200).json({
            message: "OTP generated successfully",
            email: email
        });

        void sendMail({
            to: email,
            subject: "Your OTP Verification Code",
            html: getOtpEmailTemplate(otp, user?.name),
            text: getOtpEmailText(otp, user?.name),
        })
            .then((response) => {
                console.log("✅ OTP email sent successfully:", response.messageId);
            })
            .catch((emailError) => {
                console.error("❌ Error sending OTP email:", emailError);
            });

    } catch (error) {
        console.error("❌ Error in generateOtp:", error);
        res.status(500).json({ error: error.message });
    }
};

export const verifyOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;

        // Validate input
        if (!email || !otp) {
            return res.status(400).json({ message: "Email and OTP are required" });
        }

        // Find OTP record
        const otpData = await Otp.findOne({ email });
        if (!otpData) {
            return res.status(400).json({ message: "OTP not found. Please request a new one." });
        }

        // Check if OTP matches
        if (otpData.otp !== otp) {
            return res.status(400).json({ message: "Invalid OTP" });
        }

        // OTP is valid - delete it after successful verification
        await Otp.deleteOne({ email });

        res.status(200).json({
            message: "OTP verified successfully",
            email: email
        });
    } catch (error) {
        console.error("❌ Error in verifyOtp:", error);
        res.status(500).json({ error: error.message });
    }
};
