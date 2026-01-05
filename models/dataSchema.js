import mongoose from "mongoose";

// Operation/Scrape - references LeadData for actual lead records
const dataSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    searchString: {
        type: String,
        required: true
    },
    // References to LeadData documents
    leads: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "LeadData"
    }]
}, {
    timestamps: true
})

const Data = mongoose.model("Data", dataSchema);

export default Data;
