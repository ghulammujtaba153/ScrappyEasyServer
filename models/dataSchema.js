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
        type: [mongoose.Schema.Types.Mixed],
        default: [],
    },
    // Store WhatsApp verification results
    // Structure: { "phoneNumber": { isRegistered: bool, whatsappId: string, isBusiness: bool, verifiedAt: date } }
    whatsappVerifications: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: new Map()
    },
    // Store extracted city/location data
    // Structure: { "index": "cityName" }
    cityData: {
        type: Map,
        of: String,
        default: new Map()
    }
}, {
    timestamps: true
})

const Data = mongoose.model("Data", dataSchema);

export default Data;
