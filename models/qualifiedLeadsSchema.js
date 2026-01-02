import mongoose from 'mongoose';

// Status tracking for each lead in qualified list
const qualifiedLeadEntrySchema = new mongoose.Schema({
    // Reference to actual lead data
    leadId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LeadData',
        required: true
    },
    
    // Cold Call Status
    callStatus: {
        type: String,
        enum: ['not-called', 'pending', 'interested', 'callback', 'not-interested', 'no-answer', 'wrong-number', 'ignore', 'successful', 'failed'],
        default: 'not-called'
    },
    lastCalledAt: { type: Date },
    callNotes: { type: String, default: '' },
    recordingUrl: { type: String, default: '' },
    callAttempts: { type: Number, default: 0 },
    
    // Message Status
    messageStatus: {
        type: String,
        enum: ['not-sent', 'pending', 'sent', 'delivered', 'read', 'failed'],
        default: 'not-sent'
    },
    lastMessagedAt: { type: Date },
    messageNotes: { type: String, default: '' },
    messageAttempts: { type: Number, default: 0 },
    
}, { _id: true });

const qualifiedLeadsSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    name: {
        type: String,
        required: true,
    },
    operationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Data',
    },
    searchString: {
        type: String,
    },
    // Filters applied when creating this list
    filters: {
        locationSearch: { type: String, default: '' },
        countries: [{ type: String }],
        states: [{ type: String }],
        cities: [{ type: String }],
        whatsappStatus: { type: String, default: '' },
        ratingMin: { type: Number, default: null },
        ratingMax: { type: Number, default: null },
        reviewsMin: { type: Number, default: null },
        reviewsMax: { type: Number, default: null },
        hasWebsite: { type: String, default: '' },
        hasPhone: { type: String, default: '' },
        favorite: { type: String, default: '' },
    },
    // Lead entries with status tracking (references LeadData)
    entries: [qualifiedLeadEntrySchema],
    
    totalRecords: {
        type: Number,
        default: 0,
    },
}, {
    timestamps: true
});

const QualifiedLeads = mongoose.model('QualifiedLeads', qualifiedLeadsSchema);

export default QualifiedLeads;