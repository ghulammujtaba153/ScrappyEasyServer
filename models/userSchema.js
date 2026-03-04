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
    status: {
        type: String,
        enum: ["active", "invited", "blocked"],
        default: "active"
    },
    role: {
        type: String,
        default: "user"
    },
    invitationToken: String,
    invitationTokenExpires: Date,
}, {
    timestamps: true
})

const User = mongoose.model("User", userSchema);


export default User;
