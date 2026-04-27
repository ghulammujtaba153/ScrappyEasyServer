import mongoose from "mongoose";

const campaignSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
    },
    subject: {
        type: String,
        required: true,
    },
    body: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        enum: ["Draft", "Scheduled", "Sending", "Sent", "Failed"],
        default: "Draft",
    },
    targetType: {
        type: String,
        enum: ["Manual", "All", "Users", "Admins"],
        default: "Manual",
    },
    recipients: [{
        email: String,
        status: {
            type: String,
            enum: ["Pending", "Sent", "Failed"],
            default: "Pending"
        },
        sentAt: Date,
        error: String
    }],
    scheduledAt: {
        type: Date,
    },
    sentAt: {
        type: Date,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    stats: {
        total: { type: Number, default: 0 },
        sent: { type: Number, default: 0 },
        failed: { type: Number, default: 0 },
        opened: { type: Number, default: 0 },
        clicked: { type: Number, default: 0 },
    }
}, {
    timestamps: true
});

const Campaign = mongoose.model("Campaign", campaignSchema);
export default Campaign;
