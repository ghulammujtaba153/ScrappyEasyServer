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
        res.status(200).json({ decoded });
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
        const resetLink = `http://localhost:5173/reset-password?token=${token}&email=${email}`; // Hardcoded frontend URL for now as env might be missing

        const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
        sendSmtpEmail.subject = "Invitation to Join Dashboard";
        sendSmtpEmail.htmlContent = `<html><body>
            <h1>Welcome ${name}!</h1>
            <p>You have been invited to join the dashboard.</p>
            <p>Please click the link below to set your password:</p>
            <a href="${resetLink}">${resetLink}</a>
        </body></html>`;
        sendSmtpEmail.sender = { "name": "Admin", "email": "admin@example.com" }; // Replace with verified sender
        sendSmtpEmail.to = [{ "email": email, "name": name }];

        await emailApi.sendTransacEmail(sendSmtpEmail);

        res.status(201).json({ user, message: "User invited successfully" });
    } catch (error) {
        console.error("Invite error", error);
        res.status(500).json({ error: error.message });
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
