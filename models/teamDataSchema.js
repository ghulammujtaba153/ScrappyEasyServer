import mongoose from "mongoose";

const teamDataSchema = new mongoose.Schema({
    team: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Team",
        required: true,
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    title: {
        type: String,
    },
    description: {
        type: String,
    },
    phone: [
        {
            title: String,
            number: String,
        }
    ],
    whatsappStatus: {
        type: String,
        enum: ["not-checked", "verified", "not-verified"],
        default: "not-checked",
    },
    isWhatsapp: {
        type: Boolean,
    },
    link: {
        type: String,
    },
    status: {
        type: String,
        enum: ["new", "contacted", "qualified", "unqualified"],
        default: "new",
    },
}, {
    timestamps: true
});

const TeamData = mongoose.model("TeamData", teamDataSchema);
export default TeamData;