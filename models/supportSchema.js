import mongoose from "mongoose";

const supportSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    firstName: {
        type: String,
        required: true
    },
    lastName: {
        type: String,
        required: true
    },
    subject: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ["pending", "in progress", "completed"],
        default: "pending"
    }
}, {
    timestamps: true
})

const Support = mongoose.model("Support", supportSchema)

export default Support
