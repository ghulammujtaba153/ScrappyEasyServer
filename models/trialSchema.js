import mongoose from "mongoose";

const trialSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true
    },
    startDate: {
        type: Date,
        default: Date.now
    },
    endDate: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ['Active', 'Expired'],
        default: 'Active'
    }
}, { timestamps: true });

const Trial = mongoose.model("Trial", trialSchema);
export default Trial;
