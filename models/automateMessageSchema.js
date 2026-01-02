import mongoose from "mongoose";

// Message Automation Campaign
const AutomateMessageSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    name: {
        type: String,
        required: true
    },
    // Reference to qualified leads list (status tracked there)
    qualifiedLeadsId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "QualifiedLeads"
    },
    // Message template
    message: { type: String, default: '' },
    messageType: { type: String, enum: ['whatsapp', 'sms'], default: 'whatsapp' },
    
    // Legacy: standalone numbers not from qualified leads
    numbers: [
        {
            number: { type: String },
            status: {
                type: String,
                enum: ["pending", "sent", "delivered", "read", "failed"],
                default: "pending"
            },
            sentAt: { type: Date },
            deliveredAt: { type: Date },
            error: { type: String, default: '' }
        }
    ],
    status: {
        type: String,
        enum: ['draft', 'active', 'paused', 'completed'],
        default: 'draft'
    }
}, {
    timestamps: true
});

const AutomateMessageModel = mongoose.model("AutomateMessage", AutomateMessageSchema);

export default AutomateMessageModel;
