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
            status: scheduledAt ? 'Scheduled' : undefined,
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

        const hasScheduledAt = Object.prototype.hasOwnProperty.call(req.body, "scheduledAt");
        if (hasScheduledAt) {
            // Allow both setting and clearing the schedule
            campaign.scheduledAt = scheduledAt || null;
        }

        if (status) {
            campaign.status = status;
        } else if (campaign.status !== "Sent" && campaign.status !== "Sending") {
            // Keep status consistent with schedule when status isn't explicitly supplied
            campaign.status = campaign.scheduledAt ? "Scheduled" : "Draft";
        }
        
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

        const pendingRecipients = campaign.recipients.filter(r => r.status === "Pending");
        if (!pendingRecipients.length) {
            return res.status(400).json({ success: false, message: "No pending recipients to send" });
        }

        res.status(200).json({ success: true, message: "Campaign sending started in batches" });

        // Run sending in background
        // Delegate to shared sender to allow programmatic triggers
        sendCampaignById(campaign._id).catch(err => console.error('Background send error:', err));

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const sendCampaignById = async (campaignId) => {
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) throw new Error('Campaign not found');

    if (campaign.status === 'Sent' || campaign.status === 'Sending') {
        throw new Error('Campaign already sent or currently sending');
    }

    campaign.status = 'Sending';
    await campaign.save();

    const BATCH_SIZE = 10;
    const DELAY_BETWEEN_BATCHES = 5000; // 5 seconds

    let sentCount = campaign.stats.sent || 0;
    let failedCount = campaign.stats.failed || 0;

    const recipientsToSend = campaign.recipients.filter(r => r.status === 'Pending');

    console.log(`\n📧 [CAMPAIGN] Starting send for campaign: "${campaign.title}" (${campaign._id})`);
    console.log(`📧 [CAMPAIGN] Subject: ${campaign.subject}`);
    console.log(`📧 [CAMPAIGN] FROM address: ${process.env.RESEND_EMAIL_FROM}`);
    console.log(`📧 [CAMPAIGN] Total pending recipients: ${recipientsToSend.length}`);

    if (!recipientsToSend.length) {
        console.warn('⚠️  [CAMPAIGN] No pending recipients found. Marking as Sent and exiting.');
        if (campaign.status !== 'Sent') {
            campaign.status = 'Sent';
            campaign.sentAt = campaign.sentAt || new Date();
            await campaign.save();
        }
        return;
    }

    for (let i = 0; i < recipientsToSend.length; i += BATCH_SIZE) {
        const batch = recipientsToSend.slice(i, i + BATCH_SIZE);
        console.log(`\n📦 [CAMPAIGN] Sending batch ${Math.floor(i / BATCH_SIZE) + 1} — recipients ${i + 1}–${Math.min(i + BATCH_SIZE, recipientsToSend.length)}`);

        await Promise.all(batch.map(async (recipient) => {
            console.log(`  ➤  Sending to: ${recipient.email}`);
            try {
                const emailHtml = baseLayout(campaign.subject, campaign.body);
                const result = await sendMail({
                    to: recipient.email,
                    subject: campaign.subject,
                    html: emailHtml,
                    text: campaign.body.replace(/<[^>]*>?/gm, '') // Strip HTML
                });

                console.log(`  ✅  [${recipient.email}] Sent OK — Resend ID: ${result?.id}`);

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
                console.error(`  ❌  [${recipient.email}] FAILED:`);
                console.error(`       Message: ${error.message}`);
                console.error(`       Full error:`, JSON.stringify(error, null, 2));

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

        await Campaign.findByIdAndUpdate(campaign._id, {
            "stats.sent": sentCount,
            "stats.failed": failedCount
        });

        console.log(`  📊 Batch done — cumulative sent: ${sentCount}, failed: ${failedCount}`);

        if (i + BATCH_SIZE < recipientsToSend.length) {
            console.log(`  ⏳ Waiting 5s before next batch...`);
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
    }

    const updatedCampaign = await Campaign.findById(campaign._id);
    const allDone = updatedCampaign.recipients.every(r => r.status !== 'Pending');

    if (allDone) {
        // Mark campaign as failed if every pending email failed.
        if (sentCount === 0 && failedCount > 0) {
            updatedCampaign.status = 'Failed';
            console.error(`\n❌ [CAMPAIGN] All ${failedCount} emails failed. Campaign marked Failed.`);
        } else {
            updatedCampaign.status = 'Sent';
            updatedCampaign.sentAt = new Date();
            console.log(`\n✅ [CAMPAIGN] Done — sent: ${sentCount}, failed: ${failedCount}. Campaign marked Sent.`);
        }
        await updatedCampaign.save();
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

/**
 * GET /campaigns/:id/debug
 * Returns full recipient list with statuses and errors.
 * Useful for diagnosing why emails failed.
 */
export const debugCampaign = async (req, res) => {
    try {
        const campaign = await Campaign.findById(req.params.id).lean();
        if (!campaign) {
            return res.status(404).json({ success: false, message: "Campaign not found" });
        }

        const summary = {
            title: campaign.title,
            subject: campaign.subject,
            status: campaign.status,
            stats: campaign.stats,
            sentAt: campaign.sentAt,
            scheduledAt: campaign.scheduledAt,
            resendFrom: process.env.RESEND_EMAIL_FROM || "⚠️ NOT SET",
            recipients: campaign.recipients.map(r => ({
                email: r.email,
                status: r.status,
                sentAt: r.sentAt || null,
                error: r.error || null,
            })),
        };

        console.log(`\n🔍 [DEBUG] Campaign "${campaign.title}" (${campaign._id})`);
        console.log(`   Status : ${campaign.status}`);
        console.log(`   Stats  :`, campaign.stats);
        campaign.recipients.forEach(r => {
            const icon = r.status === 'Sent' ? '✅' : r.status === 'Failed' ? '❌' : '⏳';
            console.log(`   ${icon} ${r.email} — ${r.status}${r.error ? ` | ${r.error}` : ''}`);
        });

        res.status(200).json({ success: true, data: summary });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * POST /campaigns/:id/reset
 * Resets a stuck Sending/Failed campaign back to Draft.
 * Also resets all Failed/Pending recipients back to Pending.
 * Use this when a campaign got stuck in "Sending" or "Failed" and needs to be retried.
 */
export const resetCampaign = async (req, res) => {
    try {
        const campaign = await Campaign.findById(req.params.id);
        if (!campaign) {
            return res.status(404).json({ success: false, message: "Campaign not found" });
        }

        if (campaign.status === 'Sent') {
            return res.status(400).json({
                success: false,
                message: "Cannot reset a fully Sent campaign. Delete and recreate it if needed."
            });
        }

        // Reset campaign-level status
        campaign.status = 'Draft';
        campaign.sentAt = undefined;

        // Reset stats
        campaign.stats.sent = 0;
        campaign.stats.failed = 0;

        // Reset only Failed or stuck Pending recipients back to Pending
        campaign.recipients = campaign.recipients.map(r => ({
            ...r.toObject(),
            status: 'Pending',
            sentAt: undefined,
            error: undefined,
        }));

        campaign.stats.total = campaign.recipients.length;

        await campaign.save();

        console.log(`\n🔄 [RESET] Campaign "${campaign.title}" (${campaign._id}) reset to Draft.`);
        console.log(`   ${campaign.recipients.length} recipients set back to Pending.`);

        res.status(200).json({
            success: true,
            message: `Campaign reset to Draft. ${campaign.recipients.length} recipients are now Pending.`,
            data: { status: campaign.status, stats: campaign.stats }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
