import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true
    },
    address: {
        type: String,
    },
    city: {
        type: String,
    },
    country: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    gender: {
        type: String,
        enum: ['male', 'female', 'other'],
    },
    dob: {
        type: Date,
    },
    areaOfInterest: {
        type: String,
    },
    status: {
        type: String,
        default: "active"
    },
    role: {
        type: String,
        default: "user"
    },
}, {
    timestamps: true
})

const User = mongoose.model("User", userSchema);


export default User;
