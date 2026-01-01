import User from "../models/userSchema.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import SibApiV3Sdk from "sib-api-v3-sdk";
import { emailApi } from "../utils/mailer.js";


export const register = async (req, res) => {
    try {
        if (!req.body.name || !req.body.email || !req.body.phone || !req.body.country || !req.body.password) {
            return res.status(400).json({ message: "All fields are required" });
        }
        if (req.body.password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters long" });
        } else {
            const hashedPassword = await bcrypt.hash(req.body.password, 10);
            req.body.password = hashedPassword;
        }
        const user = await User.create(req.body);
        res.status(201).json({ user, message: "User registered successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}


export const login = async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email });
        if (!user) {
            return res.status(400).json({ message: "User not found" });
        }
        const isPasswordValid = await bcrypt.compare(req.body.password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ message: "Invalid password" });
        }
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "5d" });
        res.status(200).json({ user, token, message: "Login successful" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}


export const updateUser = async (req, res) => {
    try {
        if (req.body.password) {
            const hashedPassword = await bcrypt.hash(req.body.password, 10);
            req.body.password = hashedPassword;
        }
        const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json({ user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}


export const verifyToken = async (req, res) => {
    try {
        const token = req.headers.authorization.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Fetch user from database to return complete user data
        const user = await User.findById(decoded.id).select("-password");
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        
        res.status(200).json({ decoded, user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

export const getUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select("-password");
        res.status(200).json({ user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
export const getAllUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || "";
        const role = req.query.role || "";

        const query = {
            name: { $regex: search, $options: "i" },
        };

        if (role) {
            query.role = role;
        }

        const users = await User.find(query, "-password")
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        const total = await User.countDocuments(query);

        res.status(200).json({
            users,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            totalUsers: total
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

export const deleteUser = async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        res.status(200).json({ message: "User deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

export const inviteUser = async (req, res) => {
    try {
        const { email, name, role } = req.body;

        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "User already exists" });
        }

        // Generate random password
        const randomPassword = Math.random().toString(36).slice(-8);
        const hashedPassword = await bcrypt.hash(randomPassword, 10);

        const user = await User.create({
            email,
            name: name || "User",
            role: role || "user",
            password: hashedPassword,
            phone: req.body.phone || "0000000000",
            country: req.body.country || "Unknown"
        });

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1d" });
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
        const resetLink = `${frontendUrl}/reset-password?token=${token}&email=${email}`;

        // Use verified sender from environment variables
        const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.BREVO_FROM;
        const senderName = process.env.BREVO_SENDER_NAME || "Dashboard Admin";

        if (!senderEmail) {
            console.error("BREVO_SENDER_EMAIL not configured");
            return res.status(500).json({ 
                message: "Email service not configured. User created but invitation email not sent.",
                user 
            });
        }

        const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
        sendSmtpEmail.subject = "Invitation to Join Dashboard";
        sendSmtpEmail.htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #3B82F6, #2563EB); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .header h1 { color: white; margin: 0; }
                    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
                    .button { display: inline-block; background: #3B82F6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                    .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Welcome to Dashboard!</h1>
                    </div>
                    <div class="content">
                        <h2>Hello ${name || 'there'}!</h2>
                        <p>You have been invited to join our dashboard platform.</p>
                        <p>Click the button below to set your password and get started:</p>
                        <p style="text-align: center;">
                            <a href="${resetLink}" class="button">Set Your Password</a>
                        </p>
                        <p>Or copy and paste this link in your browser:</p>
                        <p style="word-break: break-all; color: #3B82F6;">${resetLink}</p>
                        <p>This link will expire in 24 hours.</p>
                    </div>
                    <div class="footer">
                        <p>If you didn't request this invitation, please ignore this email.</p>
                    </div>
                </div>
            </body>
            </html>
        `;
        sendSmtpEmail.sender = { name: senderName, email: senderEmail };
        sendSmtpEmail.to = [{ email: email, name: name || "User" }];

        await emailApi.sendTransacEmail(sendSmtpEmail);

        res.status(201).json({ user, message: "User invited successfully. Invitation email sent!" });
    } catch (error) {
        console.error("Invite error:", error);
        res.status(500).json({ 
            message: "Failed to invite user", 
            error: error.message 
        });
    }
}

export const resetPassword = async (req, res) => {
    try {
        const { email, newPassword } = req.body;

        if (!email || !newPassword) {
            return res.status(400).json({ message: "Email and new password are required" });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters long" });
        }

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        user.password = hashedPassword;
        await user.save();

        res.status(200).json({ message: "Password reset successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

// Invite user reset password - verifies token and sets new password
export const inviteResetPassword = async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;

        if (!token) {
            return res.status(400).json({ message: "Token is required" });
        }

        if (!password) {
            return res.status(400).json({ message: "Password is required" });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters long" });
        }

        // Verify the token
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(400).json({ message: "Invitation link has expired. Please request a new invitation." });
            }
            return res.status(400).json({ message: "Invalid invitation link" });
        }

        // Find user by email from token
        const user = await User.findOne({ email: decoded.email });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Update password
        user.password = hashedPassword;
        await user.save();

        res.status(200).json({ message: "Password set successfully! You can now login." });
    } catch (error) {
        console.error("Invite reset password error:", error);
        res.status(500).json({ message: "Failed to set password", error: error.message });
    }
}
