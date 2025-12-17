import AutomateMessageModel from "../models/AutomateMessageSchema.js";
import whatsappService from "../services/whatsapp.service.js";

export const create = async (req, res) => {
    try {
        const { name, message, numbers, userId } = req.body;

        // Transform simplified number array (if strings) to object structure
        const formattedNumbers = numbers.map(num => {
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
        const automateMessages = await AutomateMessageModel.find({ userId: req.params.userId }).sort({ createdAt: -1 });
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
        );
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

        const list = await AutomateMessageModel.findById(listId);
        if (!list) {
            return res.status(404).json({ error: 'List not found' });
        }

        if (!list.message) {
            return res.status(400).json({ error: 'No message content defined for this list' });
        }

        // Find pending numbers
        // We need to use index of the array to update specific items
        const pendingIndices = list.numbers
            .map((item, index) => ({ ...item.toObject(), originalIndex: index }))
            .filter(item => item.status === 'pending')
            .slice(0, batchSize);

        if (pendingIndices.length === 0) {
            return res.json({ success: true, message: 'No pending numbers to send', processed: 0 });
        }

        const uniquePending = pendingIndices;
        console.log(`Sending batch of ${uniquePending.length} messages...`);

        const results = [];
        let successCount = 0;
        let failedCount = 0;

        for (const item of uniquePending) {
            try {
                // Send message via WhatsApp Service
                // Note: sendText(sessionId, to, text)
                // 'to' needs to be formatted as JID usually, but service might handle it.
                // Assuming service handles standard phone numbers or we append @s.whatsapp.net
                // Let's assume input is just phone, service usually expects JID.
                // We'll try to use the raw number and let service handle or format it.
                // check service implementation
                const jid = item.number.includes('@') ? item.number : `${item.number.replace(/\D/g, '')}@s.whatsapp.net`;

                await whatsappService.sendMessage(sessionId, jid, { text: list.message });

                // Update status in memory (will save later)
                list.numbers[item.originalIndex].status = 'sent';
                list.numbers[item.originalIndex].sentAt = new Date();
                list.numbers[item.originalIndex].error = undefined;
                successCount++;
                results.push({ number: item.number, status: 'sent' });

                // Random delay between 1-3 seconds to respect rate limits
                await new Promise(r => setTimeout(r, Math.random() * 2000 + 1000));

            } catch (error) {
                console.error(`Failed to send to ${item.number}:`, error);
                list.numbers[item.originalIndex].status = 'failed';
                list.numbers[item.originalIndex].error = error.message;
                failedCount++;
                results.push({ number: item.number, status: 'failed', error: error.message });
            }
        }

        // Save entire document
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