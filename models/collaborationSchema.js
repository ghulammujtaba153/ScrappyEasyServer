import mongoose from "mongoose";

const collaborationSchema = new mongoose.Schema({
    participants: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: "User",
        required: true
    },
    meetLink: {
        type: String,
        required: true
    },
    message:{
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ["pending", "accepted", "declined"],
        default: "pending"
    },
}, { timestamps: true })

const Collaboration = mongoose.model("Collaboration", collaborationSchema);

export default Collaboration;