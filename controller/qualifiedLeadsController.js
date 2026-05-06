import QualifiedLeads from "../models/qualifiedLeadsSchema.js";
import LeadData from "../models/leadDataSchema.js";
import User from "../models/userSchema.js";
import { sendMetaCAPIEvent } from "../utils/metaPixel.js";

export const createQualifiedLead = async (req, res) => {
    try {
        const { userId, name, operationId, searchString, filters, leadIds } = req.body;

        if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
            return res.status(400).json({ success: false, message: "leadIds array is required" });
        }

        // Create entries array from leadIds (references to LeadData)
        const entries = leadIds.map(leadId => ({
            leadId,
            callStatus: 'not-called',
            messageStatus: 'not-sent'
        }));

        const qualifiedLead = new QualifiedLeads({
            userId,
            name,
            operationId,
            searchString,
            filters,
            entries,
            totalRecords: entries.length
        });

        await qualifiedLead.save();
        
        // Track Meta CAPI event for Qualified Lead
        try {
            const user = await User.findById(userId);
            if (user) {
                sendMetaCAPIEvent('Lead', user, {
                    content_name: 'Qualified Lead List',
                    content_category: 'Lead Management',
                    value: entries.length * 0.1, // Symbolic value per lead
                    currency: 'USD'
                }, req);
            }
        } catch (e) {
            console.error("CAPI error in qualified lead:", e);
        }
        
        // Populate the lead data before returning
        await qualifiedLead.populate('entries.leadId');
        
        res.status(201).json({ success: true, data: qualifiedLead });
    } catch (error) {
        console.error("Error creating qualified lead:", error);
        res.status(400).json({ success: false, message: error.message });
    }
}


export const getQualifiedLeads = async (req, res) => {
    try {
        const qualifiedLeads = await QualifiedLeads.find({ userId: req.params.userId })
            .sort({ createdAt: -1 });
        res.status(200).json(qualifiedLeads);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export const getQualifiedLeadById = async (req, res) => {
    try {
        const qualifiedLead = await QualifiedLeads.findById(req.params.id)
            .populate('entries.leadId');
        
        if (!qualifiedLead) {
            return res.status(404).json({ message: "Qualified lead not found" });
        }
        res.status(200).json(qualifiedLead);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export const updateQualifiedLead = async (req, res) => {
    try {
        const qualifiedLead = await QualifiedLeads.findByIdAndUpdate(
            req.params.id, 
            req.body, 
            { new: true }
        ).populate('entries.leadId');
        
        res.status(200).json(qualifiedLead);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}


export const deleteQualifiedLead = async (req, res) => {
    try {
        await QualifiedLeads.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Qualified lead deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// Update call status for a specific entry in qualified leads
export const updateCallStatus = async (req, res) => {
    try {
        const { qualifiedLeadId, entryId, callStatus, callNotes, callRecordingUrl } = req.body;

        const qualifiedLead = await QualifiedLeads.findById(qualifiedLeadId);
        
        if (!qualifiedLead) {
            return res.status(404).json({ message: "Qualified lead not found" });
        }

        const entry = qualifiedLead.entries.id(entryId);
        
        if (!entry) {
            return res.status(404).json({ message: "Entry not found" });
        }

        entry.callStatus = callStatus;
        entry.lastCalledAt = new Date();
        entry.callAttempts = (entry.callAttempts || 0) + 1;
        
        if (callNotes) entry.callNotes = callNotes;
        if (callRecordingUrl) entry.callRecordingUrl = callRecordingUrl;

        await qualifiedLead.save();

        res.status(200).json({ 
            message: "Call status updated successfully",
            entry 
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// Update message status for a specific entry in qualified leads
export const updateMessageStatus = async (req, res) => {
    try {
        const { qualifiedLeadId, entryId, messageStatus, messageNotes } = req.body;

        const qualifiedLead = await QualifiedLeads.findById(qualifiedLeadId);
        
        if (!qualifiedLead) {
            return res.status(404).json({ message: "Qualified lead not found" });
        }

        const entry = qualifiedLead.entries.id(entryId);
        
        if (!entry) {
            return res.status(404).json({ message: "Entry not found" });
        }

        entry.messageStatus = messageStatus;
        entry.lastMessagedAt = new Date();
        entry.messageAttempts = (entry.messageAttempts || 0) + 1;
        
        if (messageNotes) entry.messageNotes = messageNotes;

        await qualifiedLead.save();

        res.status(200).json({ 
            message: "Message status updated successfully",
            entry 
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// Get stats for a qualified lead list
export const getQualifiedLeadStats = async (req, res) => {
    try {
        const qualifiedLead = await QualifiedLeads.findById(req.params.id)
            .populate('entries.leadId');
        
        if (!qualifiedLead) {
            return res.status(404).json({ message: "Qualified lead not found" });
        }

        const stats = {
            total: qualifiedLead.entries.length,
            call: {
                notCalled: qualifiedLead.entries.filter(e => e.callStatus === 'not-called').length,
                pending: qualifiedLead.entries.filter(e => e.callStatus === 'pending').length,
                successful: qualifiedLead.entries.filter(e => e.callStatus === 'successful').length,
                failed: qualifiedLead.entries.filter(e => e.callStatus === 'failed').length,
                noAnswer: qualifiedLead.entries.filter(e => e.callStatus === 'no-answer').length,
                callback: qualifiedLead.entries.filter(e => e.callStatus === 'callback').length,
            },
            message: {
                notSent: qualifiedLead.entries.filter(e => e.messageStatus === 'not-sent').length,
                pending: qualifiedLead.entries.filter(e => e.messageStatus === 'pending').length,
                sent: qualifiedLead.entries.filter(e => e.messageStatus === 'sent').length,
                delivered: qualifiedLead.entries.filter(e => e.messageStatus === 'delivered').length,
                read: qualifiedLead.entries.filter(e => e.messageStatus === 'read').length,
                failed: qualifiedLead.entries.filter(e => e.messageStatus === 'failed').length,
            },
            whatsapp: {
                verified: qualifiedLead.entries.filter(e => e.leadId?.whatsappStatus === 'verified').length,
                notVerified: qualifiedLead.entries.filter(e => e.leadId?.whatsappStatus === 'not-verified').length,
                notChecked: qualifiedLead.entries.filter(e => !e.leadId?.whatsappStatus || e.leadId?.whatsappStatus === 'not-checked').length,
            }
        };

        res.status(200).json(stats);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}