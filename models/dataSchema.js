import mongoose from "mongoose";

const dataSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    searchString: {
        type: String,
        required: true
    },
    data: {
        type: Object,
        required: true
    }
}, {
    timestamps: true
})

const Data = mongoose.model("Data", dataSchema);

export default Data;
