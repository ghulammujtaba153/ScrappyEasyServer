// import AutomateMessageModel from "../models/AutomateMessageSchema.js";
import whatsappService from "../services/whatsapp.service.js";
import AutomateMessageModel from "../models/automateMessageSchema.js";
import QualifiedLeads from "../models/qualifiedLeadsSchema.js";

export const create = async (req, res) => {
    try {
        const { name, message, numbers, userId, qualifiedLeadsId } = req.body;

        // If creating from qualified leads
        if (qualifiedLeadsId) {
            const automateMessage = await AutomateMessageModel.create({
                name,
                message,
                userId,
                qualifiedLeadsId,
                numbers: [] // Use qualified leads entries instead
            });
            
            // Populate and return
            const populated = await AutomateMessageModel.findById(automateMessage._id)
                .populate({
                    path: 'qualifiedLeadsId',
                    populate: {
                        path: 'entries.leadId',
                        model: 'LeadData'
                    }
                });
            
            return res.status(201).json(populated);
        }

        // Legacy: Transform simplified number array (if strings) to object structure
        const formattedNumbers = (numbers || []).map(num => {
            if (typeof num === 'string') {
                return { number: num, status: 'pending' };
            }
            return num;
        });

        const automateMessage = await AutomateMessageModel.create({
            name,
            message,
            userId,
            numbers: formattedNumbers
        });
        res.status(201).json(automateMessage);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}


export const getAllAutomateMessages = async (req, res) => {
    try {
        const automateMessages = await AutomateMessageModel.find({ userId: req.params.userId })
            .populate({
                path: 'qualifiedLeadsId',
                populate: {
                    path: 'entries.leadId',
                    model: 'LeadData'
                }
            })
            .sort({ createdAt: -1 });
        res.status(200).json(automateMessages);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

export const update = async (req, res) => {
    try {
        const automateMessage = await AutomateMessageModel.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        ).populate({
            path: 'qualifiedLeadsId',
            populate: {
                path: 'entries.leadId',
                model: 'LeadData'
            }
        });
        res.status(200).json(automateMessage);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}


export const deleteMessage = async (req, res) => {
    try {
        const automateMessage = await AutomateMessageModel.findByIdAndDelete(
            req.params.id
        );
        res.status(200).json(automateMessage);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

export const sendBatch = async (req, res) => {
    try {
        const { listId, batchSize = 10, sessionId = 'default' } = req.body;

        const list = await AutomateMessageModel.findById(listId)
            .populate({
                path: 'qualifiedLeadsId',
                populate: {
                    path: 'entries.leadId',
                    model: 'LeadData'
                }
            });
            
        if (!list) {
            return res.status(404).json({ error: 'List not found' });
        }

        if (!list.message) {
            return res.status(400).json({ error: 'No message content defined for this list' });
        }

        // Check if using qualified leads or legacy numbers
        if (list.qualifiedLeadsId && list.qualifiedLeadsId.entries?.length > 0) {
            // Use qualified leads entries
            return await sendBatchFromQualifiedLeads(list, batchSize, sessionId, res);
        }

        // Legacy: Find pending numbers from numbers array
        const pendingIndices = list.numbers
            .map((item, index) => ({ ...item.toObject(), originalIndex: index }))
            .filter(item => item.status === 'pending')
            .slice(0, batchSize);

        if (pendingIndices.length === 0) {
            return res.json({ success: true, message: 'No pending numbers to send', processed: 0 });
        }

        const results = [];
        let successCount = 0;
        let failedCount = 0;

        for (const item of pendingIndices) {
            try {
                const jid = item.number.includes('@') ? item.number : `${item.number.replace(/\D/g, '')}@s.whatsapp.net`;
                await whatsappService.sendMessage(sessionId, jid, { text: list.message });

                list.numbers[item.originalIndex].status = 'sent';
                list.numbers[item.originalIndex].sentAt = new Date();
                list.numbers[item.originalIndex].error = undefined;
                successCount++;
                results.push({ number: item.number, status: 'sent' });

                await new Promise(r => setTimeout(r, Math.random() * 2000 + 1000));
            } catch (error) {
                console.error(`Failed to send to ${item.number}:`, error);
                list.numbers[item.originalIndex].status = 'failed';
                list.numbers[item.originalIndex].error = error.message;
                failedCount++;
                results.push({ number: item.number, status: 'failed', error: error.message });
            }
        }

        await list.save();

        res.json({
            success: true,
            processed: results.length,
            successCount,
            failedCount,
            results
        });

    } catch (error) {
        console.error('Batch send error:', error);
        res.status(500).json({ error: error.message });
    }
}

// Helper function to send batch from qualified leads
async function sendBatchFromQualifiedLeads(list, batchSize, sessionId, res) {
    const qualifiedLeads = list.qualifiedLeadsId;
    
    // Find entries with not-sent or failed message status that have phone numbers
    const pendingEntries = qualifiedLeads.entries
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => {
            const hasPhone = entry.leadId?.phone;
            const isPending = entry.messageStatus === 'not-sent' || entry.messageStatus === 'pending';
            return hasPhone && isPending;
        })
        .slice(0, batchSize);

    if (pendingEntries.length === 0) {
        return res.json({ success: true, message: 'No pending entries to send', processed: 0 });
    }

    const results = [];
    let successCount = 0;
    let failedCount = 0;

    // Get the qualified leads document to update
    const qualifiedLeadsDoc = await QualifiedLeads.findById(qualifiedLeads._id);

    for (const { entry, index } of pendingEntries) {
        const phone = entry.leadId.phone;
        const businessName = entry.leadId.title || 'Customer';
        
        try {
            const jid = phone.includes('@') ? phone : `${phone.replace(/\D/g, '')}@s.whatsapp.net`;
            
            // Personalize message if needed
            const personalizedMessage = list.message.replace(/\{name\}/gi, businessName);
            
            await whatsappService.sendMessage(sessionId, jid, { text: personalizedMessage });

            // Update entry status in qualified leads
            qualifiedLeadsDoc.entries[index].messageStatus = 'sent';
            qualifiedLeadsDoc.entries[index].lastMessagedAt = new Date();
            qualifiedLeadsDoc.entries[index].messageAttempts = (qualifiedLeadsDoc.entries[index].messageAttempts || 0) + 1;
            
            successCount++;
            results.push({ 
                phone, 
                businessName, 
                status: 'sent',
                entryId: entry._id
            });

            await new Promise(r => setTimeout(r, Math.random() * 2000 + 1000));
        } catch (error) {
            console.error(`Failed to send to ${phone}:`, error);
            
            qualifiedLeadsDoc.entries[index].messageStatus = 'failed';
            qualifiedLeadsDoc.entries[index].messageNotes = error.message;
            qualifiedLeadsDoc.entries[index].messageAttempts = (qualifiedLeadsDoc.entries[index].messageAttempts || 0) + 1;
            
            failedCount++;
            results.push({ 
                phone, 
                businessName, 
                status: 'failed', 
                error: error.message,
                entryId: entry._id
            });
        }
    }

    // Save qualified leads with updated statuses
    await qualifiedLeadsDoc.save();

    res.json({
        success: true,
        processed: results.length,
        successCount,
        failedCount,
        results
    });
}