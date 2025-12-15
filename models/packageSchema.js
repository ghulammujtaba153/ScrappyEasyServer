import mongoose from "mongoose";

const packageSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    description: {
        type: String,
    },
    price: {
        type: Number,
        required: true,
    },
    currency: {
        type: String,
        default: "USD",
    },
    interval: {
        type: String, // e.g., 'month', 'year', 'one-time'
        required: true,
    },
    features: [{
        type: String
    }],
    stripePriceId: {
        type: String,
    },
    active: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

const Package = mongoose.model("Package", packageSchema);
export default Package;
