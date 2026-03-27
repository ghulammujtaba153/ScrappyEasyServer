import mongoose from "mongoose";

const leadDataSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    // Reference to original operation/scrape
    operationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Data"
    },
    // Business Information
    title: {
        type: String,
        default: ''
    },
    rating: {
        type: String,
        default: ''
    },
    reviews: {
        type: String,
        default: ''
    },
    phone: {
        type: String,
        default: ''
    },
    address: {
        type: String,
        default: ''
    },
    city: {
        type: String,
        default: ''
    },
    website: {
        type: String,
        default: ''
    },
    googleMapsLink: {
        type: String,
        default: ''
    },
    // Screenshot URL for the website
    screenshotUrl: {
        type: String,
        default: ''
    },
    // WhatsApp verification status
    whatsappStatus: {
        type: String,
        enum: ['verified', 'not-verified', 'not-checked', ''],
        default: ''
    },
    whatsappVerifiedAt: {
        type: Date
    },
    // Favorite flag
    favorite: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ['not-reached', 'interested', 'not-interested', "no-response" ],
        default: 'not-reached'
    },
    // Emails extracted from the website
    emails: [{
        type: String,
        default: []
    }],
    // Additional metadata from scraping
    // Additional metadata from scraping
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

// Index for faster queries
leadDataSchema.index({ userId: 1, operationId: 1 });
leadDataSchema.index({ phone: 1 });
leadDataSchema.index({ userId: 1, createdAt: -1 });

const LeadData = mongoose.model("LeadData", leadDataSchema);

export default LeadData;
