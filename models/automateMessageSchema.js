import mongoose from "mongoose";

const AutomateMessageSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    name: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: false
    },
    numbers: []

}, {
    timestamps: true
})

const AutomateMessageModel = mongoose.model("AutomateMessage", AutomateMessageSchema);

export default AutomateMessageModel;
