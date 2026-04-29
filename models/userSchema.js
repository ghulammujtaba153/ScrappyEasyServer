import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: false
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    country: {
        type: String,
        required: false
    },
    password: {
        type: String,
        required: true
    },
    aboutUser: {
        type: String,
        required: false
    },
    userType: {
        type: String,
        enum: ["local", "INTL"],
        default: "local"
    },
    status: {
        type: String,
        enum: ["active", "invited", "blocked", "under_review"],
        default: "under_review"
    },
    role: {
        type: String,
        default: "user"
    },
    invitationToken: String,
    invitationTokenExpires: Date,
    paymentScreenshot: {
        type: String,
        required: false
    },
    planName: String,
    planAmount: String,
    planExpiry: Date,
    planId: String,
    gender: {
        type: String,
        enum: ["male", "female", "other"],
        required: false
    },
    dob: {
        type: Date,
        required: false
    },
    areaOfInterest: {
        type: [String], // Array of countries
        required: false,
        default: []
    },
    isProfileComplete: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
})

const User = mongoose.model("User", userSchema);


export default User;
