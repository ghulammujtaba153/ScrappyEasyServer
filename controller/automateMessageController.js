import whatsappController from "./whatsAppVerification.js";
import AutomateMessageModel from "../models/automateMessageSchema.js";
import QualifiedLeads from "../models/qualifiedLeadsSchema.js";

// Track daily message count per user (in-memory, resets on server restart)
// In production, store this in DB or Redis
const dailyMessageCount = new Map();

const getDailyKey = (userId) => {
    const today = new Date().toISOString().split('T')[0];
    return `${userId}_${today}`;
};

const getDailyCount = (userId) => {
    const key = getDailyKey(userId);
    return dailyMessageCount.get(key) || 0;
};

const incrementDailyCount = (userId, count = 1) => {
    const key = getDailyKey(userId);
    const current = dailyMessageCount.get(key) || 0;
    dailyMessageCount.set(key, current + count);
    return current + count;
};

const DAILY_MESSAGE_LIMIT = 10;
const MESSAGE_DELAY_MS = 2000; // 2 seconds between messages

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
        const { listId, batchSize = 10, userId } = req.body;

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

        // Use the userId from the list if not provided in body
        const effectiveUserId = userId || list.userId;

        // Check daily limit
        const currentCount = getDailyCount(effectiveUserId);
        const remainingAllowed = DAILY_MESSAGE_LIMIT - currentCount;
        
        if (remainingAllowed <= 0) {
            return res.status(429).json({ 
                success: false, 
                error: `Daily message limit (${DAILY_MESSAGE_LIMIT}) reached. Try again tomorrow.`,
                remainingMessages: 0
            });
        }

        // Adjust batchSize based on remaining allowed messages
        const effectiveBatchSize = Math.min(batchSize, remainingAllowed);

        // Check if using qualified leads or legacy numbers
        if (list.qualifiedLeadsId && list.qualifiedLeadsId.entries?.length > 0) {
            // Use qualified leads entries
            return await sendBatchFromQualifiedLeads(list, effectiveBatchSize, effectiveUserId, res, batchSize);
        }

        // Legacy: Find pending numbers from numbers array
        const pendingIndices = list.numbers
            .map((item, index) => ({ ...item.toObject(), originalIndex: index }))
            .filter(item => item.status === 'pending')
            .slice(0, effectiveBatchSize);

        if (pendingIndices.length === 0) {
            return res.json({ success: true, message: 'No pending numbers to send', processed: 0 });
        }

        const results = [];
        let successCount = 0;
        let failedCount = 0;

        for (let i = 0; i < pendingIndices.length; i++) {
            const item = pendingIndices[i];
            try {
                await whatsappController.sendMessage(effectiveUserId, item.number, { text: list.message });

                list.numbers[item.originalIndex].status = 'sent';
                list.numbers[item.originalIndex].sentAt = new Date();
                list.numbers[item.originalIndex].error = undefined;
                
                successCount++;
                incrementDailyCount(effectiveUserId);
                results.push({ number: item.number, status: 'sent' });

                // Delay between messages
                if (i < pendingIndices.length - 1) {
                    await new Promise(r => setTimeout(r, MESSAGE_DELAY_MS));
                }
            } catch (error) {
                console.error(`Failed to send to ${item.number}:`, error);
                list.numbers[item.originalIndex].status = 'failed';
                list.numbers[item.originalIndex].error = error.message;
                failedCount++;
                results.push({ number: item.number, status: 'failed', error: error.message });
            }
        }

        await list.save();

        const updatedCount = getDailyCount(effectiveUserId);
        res.json({
            success: true,
            processed: results.length,
            successCount,
            failedCount,
            results,
            remainingMessages: DAILY_MESSAGE_LIMIT - updatedCount,
            skipped: (batchSize > effectiveBatchSize) ? (batchSize - effectiveBatchSize) : 0
        });

    } catch (error) {
        console.error('Batch send error:', error);
        res.status(500).json({ error: error.message });
    }
}

// Helper function to send batch from qualified leads
async function sendBatchFromQualifiedLeads(list, batchSize, userId, res, originalBatchSize = 10) {
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

    for (let i = 0; i < pendingEntries.length; i++) {
        const { entry, index } = pendingEntries[i];
        const phone = entry.leadId.phone;
        const businessName = entry.leadId.title || 'Customer';
        
        try {
            // Personalize message if needed
            const personalizedMessage = list.message.replace(/\{name\}/gi, businessName);
            
            await whatsappController.sendMessage(userId, phone, { text: personalizedMessage });

            // Update entry status in qualified leads
            qualifiedLeadsDoc.entries[index].messageStatus = 'sent';
            qualifiedLeadsDoc.entries[index].lastMessagedAt = new Date();
            qualifiedLeadsDoc.entries[index].messageAttempts = (qualifiedLeadsDoc.entries[index].messageAttempts || 0) + 1;
            
            successCount++;
            incrementDailyCount(userId);
            results.push({ 
                phone, 
                businessName, 
                status: 'sent',
                entryId: entry._id
            });

            // Delay between messages
            if (i < pendingEntries.length - 1) {
                await new Promise(r => setTimeout(r, MESSAGE_DELAY_MS));
            }
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

    const updatedCount = getDailyCount(userId);
    res.json({
        success: true,
        processed: results.length,
        successCount,
        failedCount,
        results,
        remainingMessages: DAILY_MESSAGE_LIMIT - updatedCount,
        skipped: (originalBatchSize > batchSize) ? (originalBatchSize - batchSize) : 0
    });
}

// Send single message to a specific entry
export const sendSingleMessage = async (req, res) => {
    try {
        const { qualifiedLeadId, entryId, messageContent, userId } = req.body;

        // Check daily limit
        const currentCount = getDailyCount(userId);
        if (currentCount >= DAILY_MESSAGE_LIMIT) {
            return res.status(429).json({ 
                success: false, 
                error: `Daily message limit (${DAILY_MESSAGE_LIMIT}) reached. Try again tomorrow.`,
                remainingMessages: 0
            });
        }

        const qualifiedLeadsDoc = await QualifiedLeads.findById(qualifiedLeadId).populate('entries.leadId');
        if (!qualifiedLeadsDoc) {
            return res.status(404).json({ success: false, error: 'Qualified lead not found' });
        }

        const entry = qualifiedLeadsDoc.entries.id(entryId);
        if (!entry) {
            return res.status(404).json({ success: false, error: 'Entry not found' });
        }

        if (!entry.leadId?.phone) {
            return res.status(400).json({ success: false, error: 'No phone number for this lead' });
        }

        const phone = entry.leadId.phone;
        const businessName = entry.leadId.title || 'Customer';

        try {
            const personalizedMessage = messageContent.replace(/\{name\}/gi, businessName);
            
            await whatsappController.sendMessage(userId, phone, { text: personalizedMessage });

            // Update entry status
            entry.messageStatus = 'sent';
            entry.lastMessagedAt = new Date();
            entry.messageAttempts = (entry.messageAttempts || 0) + 1;
            await qualifiedLeadsDoc.save();

            // Increment daily count
            const newCount = incrementDailyCount(userId);

            res.json({
                success: true,
                message: 'Message sent successfully',
                phone,
                businessName,
                remainingMessages: DAILY_MESSAGE_LIMIT - newCount
            });

        } catch (sendError) {
            entry.messageStatus = 'failed';
            entry.messageNotes = sendError.message;
            entry.messageAttempts = (entry.messageAttempts || 0) + 1;
            await qualifiedLeadsDoc.save();

            res.status(500).json({
                success: false,
                error: `Failed to send message: ${sendError.message}`,
                remainingMessages: DAILY_MESSAGE_LIMIT - currentCount
            });
        }

    } catch (error) {
        console.error('Send single message error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Send batch messages with daily limit and 2-second delay
export const sendBatchWithLimit = async (req, res) => {
    try {
        const { qualifiedLeadId, entryIds, messageContent, userId } = req.body;

        // Check daily limit
        const currentCount = getDailyCount(userId);
        const remainingAllowed = DAILY_MESSAGE_LIMIT - currentCount;
        
        if (remainingAllowed <= 0) {
            return res.status(429).json({ 
                success: false, 
                error: `Daily message limit (${DAILY_MESSAGE_LIMIT}) reached. Try again tomorrow.`,
                remainingMessages: 0
            });
        }

        const qualifiedLeadsDoc = await QualifiedLeads.findById(qualifiedLeadId)
            .populate('entries.leadId');
            
        if (!qualifiedLeadsDoc) {
            return res.status(404).json({ success: false, error: 'Qualified lead not found' });
        }

        // Limit entries to remaining allowed messages
        const entriesToProcess = entryIds.slice(0, remainingAllowed);
        
        const results = [];
        let successCount = 0;
        let failedCount = 0;

        for (let i = 0; i < entriesToProcess.length; i++) {
            const entryId = entriesToProcess[i];
            const entry = qualifiedLeadsDoc.entries.id(entryId);
            
            if (!entry || !entry.leadId?.phone) {
                results.push({ entryId, status: 'skipped', error: 'No phone number' });
                continue;
            }

            const phone = entry.leadId.phone;
            const businessName = entry.leadId.title || 'Customer';

            try {
                const personalizedMessage = messageContent.replace(/\{name\}/gi, businessName);
                
                await whatsappController.sendMessage(userId, phone, { text: personalizedMessage });

                entry.messageStatus = 'sent';
                entry.lastMessagedAt = new Date();
                entry.messageAttempts = (entry.messageAttempts || 0) + 1;
                
                successCount++;
                incrementDailyCount(userId);
                results.push({ entryId, phone, businessName, status: 'sent' });

                // 2-second delay between messages (except for last one)
                if (i < entriesToProcess.length - 1) {
                    await new Promise(r => setTimeout(r, MESSAGE_DELAY_MS));
                }

            } catch (sendError) {
                entry.messageStatus = 'failed';
                entry.messageNotes = sendError.message;
                entry.messageAttempts = (entry.messageAttempts || 0) + 1;
                
                failedCount++;
                results.push({ entryId, phone, businessName, status: 'failed', error: sendError.message });
            }
        }

        await qualifiedLeadsDoc.save();

        const newCount = getDailyCount(userId);
        res.json({
            success: true,
            processed: results.length,
            successCount,
            failedCount,
            results,
            remainingMessages: DAILY_MESSAGE_LIMIT - newCount,
            skipped: entryIds.length - entriesToProcess.length
        });

    } catch (error) {
        console.error('Send batch with limit error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Get remaining messages for today
export const getRemainingMessages = async (req, res) => {
    try {
        const { userId } = req.params;
        const currentCount = getDailyCount(userId);
        res.json({
            success: true,
            dailyLimit: DAILY_MESSAGE_LIMIT,
            sent: currentCount,
            remaining: DAILY_MESSAGE_LIMIT - currentCount
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};