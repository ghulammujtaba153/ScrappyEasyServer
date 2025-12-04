import User from "../models/userSchema.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";


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
