import User from "../models/userSchema.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { sendMail } from "../utils/mailer.js";
import Team from "../models/teamSchema.js";
import { getAdminInviteTemplate, getAdminInviteText } from "../utils/templates/adminInvite.js";
import { getSubscriptionActiveTemplate, getSubscriptionActiveText } from "../utils/templates/subscription.js";
import { getWelcomeTemplate, getWelcomeText } from "../utils/templates/welcome.js";
import { getInternationalWelcomeTemplate, getInternationalWelcomeText } from "../utils/templates/internationalWelcome.js";
import { getInternationalPaymentTemplate, getInternationalPaymentText } from "../utils/templates/internationalPayment.js";
import { sendMetaCAPIEvent } from "../utils/metaPixel.js";
import { resolvePaymentScreenshot } from "../utils/paymentScreenshot.js";


export const register = async (req, res) => {
    try {
        if (!req.body.name || !req.body.email || !req.body.password) {
            return res.status(400).json({ message: "All fields are required" });
        }
        
        const existingUser = await User.findOne({ email: req.body.email });
        if (existingUser) {
            return res.status(400).json({ message: "Email already registered" });
        }

        if (req.body.password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters long" });
        } else {
            const hashedPassword = await bcrypt.hash(req.body.password, 10);
            req.body.password = hashedPassword;
        }

        // Calculate plan expiry if it's a 2-year plan
        let planExpiry = null;
        if (req.body.planId === "2-year") {
            const date = new Date();
            date.setFullYear(date.getFullYear() + 2);
            planExpiry = date;
        }

        const paymentScreenshot = resolvePaymentScreenshot(req);
        const isLocal = !["intl", "international"].includes(
            String(req.body.userType || "local").toLowerCase()
        );
        if (req.body.planId && isLocal && !paymentScreenshot) {
            return res.status(400).json({ message: "Payment screenshot is required" });
        }

        const userData = {
            ...req.body,
            status: "under_review",
            paymentScreenshot,
            planExpiry,
            planName: req.body.planName,
            planAmount: req.body.planAmount,
            planId: req.body.planId,
        };

        const user = await User.create(userData);
        
        const isInternational = String(req.body.userType || "local").toLowerCase() === "intl";

        // Send a region-specific welcome email after registration
        try {
            await sendMail({
                to: user.email,
                subject: isInternational
                    ? "Welcome to Map Harvest!"
                    : "Welcome to Map Harvest!",
                html: isInternational
                    ? getInternationalWelcomeTemplate(user.name)
                    : getWelcomeTemplate(user.name),
                text: isInternational
                    ? getInternationalWelcomeText(user.name)
                    : getWelcomeText(user.name),
            });
            console.log(`✅ ${isInternational ? "international welcome" : "welcome"} email sent to ${user.email} after registration`);
        } catch (emailErr) {
            console.error("❌ Failed to send welcome email after registration:", emailErr);
        }
        
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "5d" });

        res.status(201).json({ 
            user: { name: user.name, email: user.email, status: user.status }, 
            token,
            message: isInternational
                ? "Registration successful! Your account is under review. Our admin team will email you the payment link shortly."
                : "Registration successful! Your account is now under review." 
        });
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

        if (user.status === "blocked") {
            return res.status(403).json({ message: "Your account has been blocked. Please contact support." });
        }

        const isPasswordValid = await bcrypt.compare(req.body.password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ message: "Invalid password" });
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "5d" });
        
        // Calculate subscription status
        let isSubscription = user.status === 'active' && !!user.planId;
        
        // Check local team membership for subscription
        if (!isSubscription) {
            const teamWithSubscribedOwner = await Team.findOne({ members: user._id }).populate('owner').lean();
            if (teamWithSubscribedOwner?.owner) {
                isSubscription = teamWithSubscribedOwner.owner.status === 'active' && !!teamWithSubscribedOwner.owner.planId;
            }
        }

        // Track Meta CAPI event for Login
        sendMetaCAPIEvent('Contact', user, {
            content_name: 'User Login',
            content_category: 'Authentication'
        }, req);

        res.status(200).json({ 
            user: { ...user.toObject(), isSubscription }, 
            token, 
            message: "Login successful" 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}


export const updateUser = async (req, res) => {
    try {
        const { id } = req.params;

        // Find existing user
        const oldUser = await User.findById(id);
        if (!oldUser) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Whitelist only safe, user-editable fields
        const allowedFields = ['name', 'email', 'country', 'aboutUser', 'password', 'gender', 'dob', 'areaOfInterest', 'status'];
        const updateData = {};

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updateData[field] = req.body[field];
            }
        }

        // If no valid fields provided, reject early
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ success: false, message: "No valid fields to update" });
        }

        // Check email uniqueness if email is being changed
        if (updateData.email && updateData.email !== oldUser.email) {
            const emailExists = await User.findOne({ email: updateData.email, _id: { $ne: id } });
            if (emailExists) {
                return res.status(400).json({ success: false, message: "Email is already in use by another account" });
            }
        }

        // Hash password if being updated
        if (updateData.password) {
            if (updateData.password.length < 6) {
                return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
            }
            updateData.password = await bcrypt.hash(updateData.password, 10);
        }

        const user = await User.findByIdAndUpdate(id, updateData, { new: true }).select('-password');

        // If status changed to active (admin-only path, not reachable here but kept for safety)
        if (req.body.status === 'active' && oldUser.status !== 'active') {
            try {
                // Fire conversion only when admin activates subscription.
                sendMetaCAPIEvent('Purchase', user, {
                    content_name: user.planName || 'Subscription',
                    currency: 'USD',
                    value: parseFloat(user.planAmount) || 0,
                    content_type: 'product',
                    contents: [{ id: user.planId || 'sub_default', quantity: 1, item_price: parseFloat(user.planAmount) || 0 }]
                }, req);

                const loginLink = `${process.env.CLIENT_URL}/login`;
                await sendMail({
                    to: user.email,
                    subject: "Your Map Harvest Subscription is Now Active!",
                    html: getSubscriptionActiveTemplate(user.name, user.planName, user.planAmount, user.planExpiry, loginLink),
                    text: getSubscriptionActiveText(user.name, user.planName),
                });
                console.log(`✅ Activation email sent to ${user.email} via updateUser`);
            } catch (emailError) {
                console.error("❌ Failed to send activation email in updateUser:", emailError);
            }
        }

        res.status(200).json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export const sendInternationalPaymentLink = async (req, res) => {
    console.log(`📩 Request to send payment link for user ID: ${req.params.id}`);
    try {
        const { paymentLink } = req.body;
        const user = await User.findById(req.params.id);

        if (!user) {
            console.warn(`⚠️ User not found for payment link: ${req.params.id}`);
            return res.status(404).json({ message: "User not found" });
        }

        if (String(user.userType || "").toLowerCase() !== "intl") {
            console.warn(`⚠️ User ${user.email} is not an international user`);
            return res.status(400).json({ message: "Payment link emails can only be sent to international users" });
        }

        const finalLink = paymentLink || process.env.INTERNATIONAL_PAYMENT_LINK;
        if (!finalLink) {
            console.warn(`⚠️ No payment link provided or found in environment`);
            return res.status(400).json({ message: "Payment link is required" });
        }

        console.log(`📤 Sending payment link email to ${user.email}...`);
        await sendMail({
            to: user.email,
            subject: "Complete Your International Payment",
            html: getInternationalPaymentTemplate(user.name, finalLink),
            text: getInternationalPaymentText(user.name, finalLink),
        });

        console.log(`✅ Payment link email sent successfully to ${user.email}`);
        res.status(200).json({
            success: true,
            message: "International payment link email sent successfully",
        });
    } catch (error) {
        console.error(`❌ Error in sendInternationalPaymentLink:`, error);
        res.status(500).json({ error: error.message });
    }
}


export const verifyToken = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader?.startsWith("Bearer ")) {
            return res.status(401).json({ error: "Authorization header missing or invalid" });
        }

        const token = authHeader.split(" ")[1];

        if (!process.env.JWT_SECRET) {
            console.error("CRITICAL: JWT_SECRET is not defined");
            return res.status(500).json({ error: "Server configuration error" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.id)
            .select("-password")
            .lean();

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Check personal subscription first
        let isSubscription = user.status === 'active' && !!user.planId;

        // If no personal subscription, check if user is a member of a team whose owner is subscribed
        if (!isSubscription) {
            const teamWithSubscribedOwner = await Team.findOne({ members: decoded.id }).populate('owner').lean();
            if (teamWithSubscribedOwner?.owner) {
                isSubscription = teamWithSubscribedOwner.owner.status === 'active' && !!teamWithSubscribedOwner.owner.planId;
            }
        }

        return res.status(200).json({
            user: {
                ...user,
                isSubscription
            }
        });

    } catch (error) {
        console.error("Token verification error:", error.message);

        if (error.name === "TokenExpiredError") {
            return res.status(401).json({ error: "Token expired" });
        }

        if (error.name === "JsonWebTokenError") {
            return res.status(401).json({ error: "Invalid token" });
        }

        return res.status(500).json({ error: "Internal server error" });
    }
};


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
        const status = req.query.status || "";

        const query = {
            name: { $regex: search, $options: "i" },
        };

        if (role) {
            query.role = role;
        }
        
        if (status) {
            query.status = status;
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
        const frontendUrl = process.env.CLIENT_URL;
        const resetLink = `${frontendUrl}/reset-password?token=${token}&email=${email}`;

        const loginLink = `${frontendUrl}/reset-password?token=${token}&email=${email}`;

        // Send email via Nodemailer
        await sendMail({
            to: email,
            subject: "Invitation to Join Map Harvest",
            html: getAdminInviteTemplate(name, resetLink),
            text: getAdminInviteText(name, resetLink),
        });

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
// Verify invitation token
export const verifyInvitationToken = async (req, res) => {
    try {
        const { token } = req.params;
        const user = await User.findOne({
            invitationToken: token,
            invitationTokenExpires: { $gt: Date.now() }
        }).select("email status");

        if (!user) {
            return res.status(400).json({ message: "Invalid or expired invitation token" });
        }

        res.status(200).json({ valid: true, email: user.email });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

// Complete invitation and activate user
export const confirmInvitation = async (req, res) => {
    try {
        const { token, password, name, country, aboutUser } = req.body;

        const user = await User.findOne({
            invitationToken: token,
            invitationTokenExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ message: "Invalid or expired invitation token" });
        }

        if (!password || password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters long" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        user.password = hashedPassword;
        user.name = name || user.name;
        user.country = country || user.country;
        user.aboutUser = aboutUser || user.aboutUser;
        user.status = "active";
        user.invitationToken = undefined;
        user.invitationTokenExpires = undefined;

        await user.save();

        res.status(200).json({ message: "Account activated successfully. You can now login.", email: user.email });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Activate user subscription and send email
export const activateUserSubscription = async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        user.status = "active";
        await user.save();

        // Send Meta CAPI event for Purchase
        sendMetaCAPIEvent('Purchase', user, {
            content_name: user.planName || 'Subscription',
            currency: 'USD',
            value: parseFloat(user.planAmount) || 0,
            content_type: 'product',
            contents: [{ id: user.planId || 'sub_default', quantity: 1 }]
        }, req);

        // Send activation email
        try {
            const loginLink = `${process.env.CLIENT_URL}/login`;
            
            await sendMail({
                to: user.email,
                subject: "Your Map Harvest Subscription is Now Active!",
                html: getSubscriptionActiveTemplate(
                    user.name, 
                    user.planName, 
                    user.planAmount, 
                    user.planExpiry, 
                    loginLink
                ),
                text: getSubscriptionActiveText(user.name, user.planName),
            });
        } catch (emailError) {
            console.error("Failed to send activation email:", emailError);
            // We continue even if email fails - user is activated in DB
        }

        res.status(200).json({ success: true, message: "Subscription activated successfully!", user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
