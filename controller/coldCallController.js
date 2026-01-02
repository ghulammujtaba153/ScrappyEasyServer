import ColdCall from "../models/coldCallSchema.js";
import QualifiedLeads from "../models/qualifiedLeadsSchema.js";

// CREATE
export const createColdCall = async (req, res) => {
    try {
        const { userId, name, numbers, qualifiedLeadsId, callScript } = req.body;

        if (!userId || !name) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        // If creating from qualified leads
        if (qualifiedLeadsId) {
            const newColdCall = new ColdCall({
                userId,
                name,
                qualifiedLeadsId,
                callScript: callScript || '',
                numbers: [] // Use qualified leads entries instead
            });

            await newColdCall.save();
            
            // Populate and return
            const populated = await ColdCall.findById(newColdCall._id)
                .populate({
                    path: 'qualifiedLeadsId',
                    populate: {
                        path: 'entries.leadId',
                        model: 'LeadData'
                    }
                });
            
            return res.status(201).json({ success: true, data: populated });
        }

        // Legacy: numbers array
        if (!numbers || !Array.isArray(numbers)) {
            return res.status(400).json({ success: false, message: "Numbers array required for standalone campaign" });
        }

        // Format numbers if they are just strings
        const formattedNumbers = numbers.map(num => {
            if (typeof num === "string") {
                return { number: num, status: "pending" };
            }
            return num;
        });

        const newColdCall = new ColdCall({
            userId,
            name,
            numbers: formattedNumbers,
            callScript: callScript || ''
        });

        await newColdCall.save();
        res.status(201).json({ success: true, data: newColdCall });
    } catch (error) {
        console.error("Error creating ColdCall:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// GET ALL FOR USER
export const getColdCallsByUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const coldCalls = await ColdCall.find({ userId })
            .populate({
                path: 'qualifiedLeadsId',
                populate: {
                    path: 'entries.leadId',
                    model: 'LeadData'
                }
            })
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: coldCalls });
    } catch (error) {
        console.error("Error fetching ColdCalls:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// GET BY ID
export const getColdCallById = async (req, res) => {
    try {
        const { id } = req.params;
        const coldCall = await ColdCall.findById(id)
            .populate({
                path: 'qualifiedLeadsId',
                populate: {
                    path: 'entries.leadId',
                    model: 'LeadData'
                }
            });
        if (!coldCall) {
            return res.status(404).json({ success: false, message: "ColdCall list not found" });
        }
        res.status(200).json({ success: true, data: coldCall });
    } catch (error) {
        console.error("Error fetching ColdCall BY ID:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// UPDATE CALL STATUS (for qualified leads based campaigns)
export const updateCallStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { entryId, status, notes, recordingUrl } = req.body;

        const coldCall = await ColdCall.findById(id);
        if (!coldCall) {
            return res.status(404).json({ success: false, message: "Campaign not found" });
        }

        if (!coldCall.qualifiedLeadsId) {
            return res.status(400).json({ success: false, message: "This campaign doesn't use qualified leads" });
        }

        // Update status in qualified leads
        const qualifiedLeads = await QualifiedLeads.findById(coldCall.qualifiedLeadsId);
        if (!qualifiedLeads) {
            return res.status(404).json({ success: false, message: "Qualified leads not found" });
        }

        const entryIndex = qualifiedLeads.entries.findIndex(e => e._id.toString() === entryId);
        if (entryIndex === -1) {
            return res.status(404).json({ success: false, message: "Entry not found" });
        }

        qualifiedLeads.entries[entryIndex].callStatus = status;
        qualifiedLeads.entries[entryIndex].lastCalledAt = new Date();
        qualifiedLeads.entries[entryIndex].callAttempts = (qualifiedLeads.entries[entryIndex].callAttempts || 0) + 1;
        if (notes) qualifiedLeads.entries[entryIndex].callNotes = notes;
        if (recordingUrl) qualifiedLeads.entries[entryIndex].recordingUrl = recordingUrl;

        await qualifiedLeads.save();

        res.status(200).json({ success: true, data: qualifiedLeads.entries[entryIndex] });
    } catch (error) {
        console.error("Error updating call status:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// UPDATE (Full update or status update)
export const updateColdCall = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, numbers, leadId, status, newNumber } = req.body;

        // Atomic update for single lead status (prevents overwriting recordingUrl)
        if (leadId && status) {
            const updatedColdCall = await ColdCall.findOneAndUpdate(
                { _id: id, "numbers._id": leadId },
                {
                    $set: {
                        "numbers.$.status": status,
                        "numbers.$.lastCalled": new Date()
                    }
                },
                { new: true }
            );

            if (!updatedColdCall) {
                return res.status(404).json({ success: false, message: "Lead not found in campaign" });
            }
            return res.status(200).json({ success: true, data: updatedColdCall });
        }

        // Atomic Add Number (prevents overwriting)
        if (newNumber) {
            const updatedColdCall = await ColdCall.findByIdAndUpdate(
                id,
                { $push: { numbers: { number: newNumber, status: 'pending' } } },
                { new: true }
            );
            if (!updatedColdCall) {
                return res.status(404).json({ success: false, message: "Campaign not found" });
            }
            return res.status(200).json({ success: true, data: updatedColdCall });
        }

        // Full update (fallback/original behavior)
        const updateData = {};
        if (name) updateData.name = name;
        if (numbers) {
            // Ensure numbers are formatted correctly
            updateData.numbers = numbers.map(num => {
                if (typeof num === "string") {
                    return { number: num, status: "pending" };
                }
                return num;
            });
        }

        const updatedColdCall = await ColdCall.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true }
        );

        if (!updatedColdCall) {
            return res.status(404).json({ success: false, message: "ColdCall list not found" });
        }

        res.status(200).json({ success: true, data: updatedColdCall });
    } catch (error) {
        console.error("Error updating ColdCall:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// DELETE
export const deleteColdCall = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await ColdCall.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({ success: false, message: "ColdCall list not found" });
        }
        res.status(200).json({ success: true, message: "ColdCall list deleted successfully" });
    } catch (error) {
        console.error("Error deleting ColdCall:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};
