import Mongoose from "mongoose";

const offersSchema = new Mongoose.Schema({
    userId: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    activities: [
        {
            text: { type: String, required: true },
            notes: { type: String },
            sequence: { type: Number, default: 0 },
            date: { type: Date, default: Date.now },
        }
    ],
    status: { type: String, enum: ["active", "inactive", "completed"], default: "active" },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

export default Mongoose.model("Offer", offersSchema);