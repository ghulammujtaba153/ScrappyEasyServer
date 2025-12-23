import mongoose from "mongoose";

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
    numbers: [
        {
            number: {
                type: String,
                required: true
            },
            status: {
                type: String,
                enum: ["pending", "successful", "failed"],
                default: "pending"
            },
            lastCalled: {
                type: Date
            }
        }
    ],
}, { timestamps: true });

const ColdCall = mongoose.model("ColdCall", coldCallSchema);

export default ColdCall;