import mongoose from "mongoose";

// Cold Call Campaign
const coldCallSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
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
    // Campaign settings
    callScript: { type: String, default: '' },
    maxAttempts: { type: Number, default: 3 },
    
    // Legacy: standalone numbers not from qualified leads
    numbers: [
        {
            number: { type: String, required: true },
            status: {
                type: String,
                enum: ["pending", "not-called", "interested", "callback", "not-interested", "no-answer", "wrong-number", "ignore", "successful", "failed"],
                default: "not-called"
            },
            lastCalled: { type: Date },
            recordingUrl: { type: String },
            attempts: { type: Number, default: 0 },
            notes: { type: String, default: '' }
        }
    ],
    status: {
        type: String,
        enum: ['draft', 'active', 'paused', 'completed'],
        default: 'draft'
    }
}, { timestamps: true });

const ColdCall = mongoose.model("ColdCall", coldCallSchema);

export default ColdCall;