import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    package: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Package",
        required: false
    },
    amount: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['Active', 'Pending', 'Cancelled', 'Completed', 'Expired'],
        default: 'Pending'
    },
    startDate: {
        type: Date,
        default: Date.now
    },
    endDate: {
        type: Date
    },
    stripeSessionId: {
        type: String,
        unique: true,
        sparse: true
    },
    stripeCustomerId: {
        type: String
    },
    stripeSubscriptionId: {
        type: String
    },
    isOneTime: {
        type: Boolean,
        default: false
    },
    lsOrderId: {
        type: String,
        unique: true,
        sparse: true
    },
    lsSubscriptionId: {
        type: String,
        unique: true,
        sparse: true
    },
    lsVariantId: {
        type: String,
    }
}, { timestamps: true });

const Subscription = mongoose.model("Subscription", subscriptionSchema);
export default Subscription;
