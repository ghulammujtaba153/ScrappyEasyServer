import Campaign from "../models/campaignSchema.js";
import { sendMail } from "../utils/mailer.js";
import User from "../models/userSchema.js";
import { baseLayout } from "../utils/templates/baseLayout.js";

export const createCampaign = async (req, res) => {
    try {
        const { title, subject, body, recipients, scheduledAt, targetType } = req.body;
        
        let finalRecipients = [];
        if (targetType === "Manual") {
            finalRecipients = recipients.map(email => ({ email }));
        } else {
            let query = {};
            if (targetType === "Users") query = { role: "user" };
            else if (targetType === "Admins") query = { role: "admin" };
            
            const users = await User.find(query);
            finalRecipients = users.map(user => ({ email: user.email }));
        }

        const campaign = new Campaign({
            title,
            subject,
            body,
            targetType: targetType || "Manual",
            recipients: finalRecipients,
            scheduledAt,
            createdBy: req.user._id,
            stats: {
                total: finalRecipients.length
            }
        });

        await campaign.save();
        res.status(201).json({ success: true, data: campaign });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getCampaigns = async (req, res) => {
    try {
        const campaigns = await Campaign.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: campaigns });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getCampaignById = async (req, res) => {
    try {
        const campaign = await Campaign.findById(req.params.id);
        if (!campaign) {
            return res.status(404).json({ success: false, message: "Campaign not found" });
        }
        res.status(200).json({ success: true, data: campaign });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateCampaign = async (req, res) => {
    try {
        const { title, subject, body, recipients, scheduledAt, status } = req.body;
        const campaign = await Campaign.findById(req.params.id);

        if (!campaign) {
            return res.status(404).json({ success: false, message: "Campaign not found" });
        }

        if (campaign.status === "Sent") {
            return res.status(400).json({ success: false, message: "Cannot edit a sent campaign" });
        }

        campaign.title = title || campaign.title;
        campaign.subject = subject || campaign.subject;
        campaign.body = body || campaign.body;
        campaign.status = status || campaign.status;
        campaign.scheduledAt = scheduledAt || campaign.scheduledAt;
        
        if (recipients) {
            campaign.recipients = recipients.map(email => ({ email }));
            campaign.stats.total = recipients.length;
        }

        await campaign.save();
        res.status(200).json({ success: true, data: campaign });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteCampaign = async (req, res) => {
    try {
        const campaign = await Campaign.findByIdAndDelete(req.params.id);
        if (!campaign) {
            return res.status(404).json({ success: false, message: "Campaign not found" });
        }
        res.status(200).json({ success: true, message: "Campaign deleted" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const sendCampaign = async (req, res) => {
    try {
        const campaign = await Campaign.findById(req.params.id);
        if (!campaign) {
            return res.status(404).json({ success: false, message: "Campaign not found" });
        }

        if (campaign.status === "Sent" || campaign.status === "Sending") {
            return res.status(400).json({ success: false, message: "Campaign already sent or currently sending" });
        }

        campaign.status = "Sending";
        await campaign.save();

        res.status(200).json({ success: true, message: "Campaign sending started in batches" });

        // Run sending in background
        (async () => {
            const BATCH_SIZE = 10;
            const DELAY_BETWEEN_BATCHES = 5000; // 5 seconds
            
            let sentCount = campaign.stats.sent || 0;
            let failedCount = campaign.stats.failed || 0;

            const recipientsToSend = campaign.recipients.filter(r => r.status === "Pending");

            for (let i = 0; i < recipientsToSend.length; i += BATCH_SIZE) {
                const batch = recipientsToSend.slice(i, i + BATCH_SIZE);
                
                await Promise.all(batch.map(async (recipient) => {
                    try {
                        const emailHtml = baseLayout(campaign.subject, campaign.body);
                        await sendMail({
                            to: recipient.email,
                            subject: campaign.subject,
                            html: emailHtml,
                            text: campaign.body.replace(/<[^>]*>?/gm, '') // Strip HTML
                        });
                        
                        // Update individual recipient in the document
                        await Campaign.updateOne(
                            { _id: campaign._id, "recipients._id": recipient._id },
                            { 
                                $set: { 
                                    "recipients.$.status": "Sent",
                                    "recipients.$.sentAt": new Date()
                                } 
                            }
                        );
                        sentCount++;
                    } catch (error) {
                        await Campaign.updateOne(
                            { _id: campaign._id, "recipients._id": recipient._id },
                            { 
                                $set: { 
                                    "recipients.$.status": "Failed",
                                    "recipients.$.error": error.message
                                } 
                            }
                        );
                        failedCount++;
                    }
                }));

                // Update stats after each batch
                await Campaign.findByIdAndUpdate(campaign._id, {
                    "stats.sent": sentCount,
                    "stats.failed": failedCount
                });

                if (i + BATCH_SIZE < recipientsToSend.length) {
                    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
                }
            }

            const updatedCampaign = await Campaign.findById(campaign._id);
            const allDone = updatedCampaign.recipients.every(r => r.status !== "Pending");
            
            if (allDone) {
                updatedCampaign.status = "Sent";
                updatedCampaign.sentAt = new Date();
                await updatedCampaign.save();
            }
        })();

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const previewCampaign = async (req, res) => {
    try {
        const { subject, body } = req.body;
        const html = baseLayout(subject || "Preview Subject", body || "<p>Preview content goes here...</p>");
        res.status(200).json({ success: true, html });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
