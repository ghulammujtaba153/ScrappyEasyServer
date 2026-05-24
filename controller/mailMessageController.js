import MailMessage from "../models/mailMessageSchema.js";
import { sendMail, resend } from "../utils/mailer.js";

// Your sending address — used to filter out self-sent webhook echoes
const OWN_EMAIL = (process.env.RESEND_EMAIL_FROM || "grow@mapharvest.live").toLowerCase();

// Helper to extract clean email address from formats like "John Doe <john@example.com>"
const extractEmail = (str) => {
  if (!str) return "";
  const match = str.match(/<([^>]+)>/);
  return match ? match[1].trim().toLowerCase() : str.trim().toLowerCase();
};

/**
 * Normalize a subject line by stripping Re:/Fwd:/FW: prefixes and trimming.
 * "Re: Re: Fwd: Welcome to Map Harvest" → "welcome to map harvest"
 */
const normalizeSubject = (subject) => {
  if (!subject) return "(no subject)";
  return subject
    .replace(/^(re:\s*|fwd?:\s*)+/i, "")
    .trim()
    .toLowerCase();
};

/**
 * Generate a threadId from subject + contactEmail.
 * All messages in the same conversation (regardless of Re: prefixes) get the same threadId.
 */
const makeThreadId = (subject, contactEmail) => {
  return `${normalizeSubject(subject)}::${contactEmail.toLowerCase()}`;
};

/**
 * Strip Gmail-style quoted reply chain from plain text.
 * Extracts only the fresh content above the "On ... wrote:" marker.
 */
const stripQuotedText = (text) => {
  if (!text) return "";
  const marker = text.search(/\r?\nOn\s.+wrote:\s*\r?\n/i);
  if (marker > 0) {
    return text.substring(0, marker).trim();
  }
  return text.trim();
};

/**
 * Strip Gmail-style quoted reply chain from HTML.
 * Removes gmail_quote_container and gmail_quote blocks.
 */
const stripQuotedHtml = (html) => {
  if (!html) return "";
  let cleaned = html.replace(/<div[^>]*class="[^"]*gmail_quote_container[^"]*"[^>]*>[\s\S]*$/i, "");
  cleaned = cleaned.replace(/<div[^>]*class="[^"]*gmail_quote[^"]*"[^>]*>[\s\S]*$/i, "");
  cleaned = cleaned.replace(/(<br\s*\/?\s*>)+\s*$/i, "");
  return cleaned.trim();
};

/**
 * Get all conversation threads (grouped by threadId)
 */
export const getMailThreads = async (req, res) => {
  try {
    const threads = await MailMessage.aggregate([
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$threadId",
          latestMessage: { $first: "$$ROOT" },
          contactEmail: { $first: "$contactEmail" },
          messageCount: { $sum: 1 },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$direction", "inbound"] },
                    { $eq: ["$isRead", false] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      { $sort: { "latestMessage.createdAt": -1 } }
    ]);

    res.status(200).json({
      success: true,
      data: threads
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch mail threads",
      error: error.message
    });
  }
};

/**
 * Get all messages for a specific thread by threadId
 */
export const getMailThreadMessages = async (req, res) => {
  try {
    const { threadId } = req.params;
    if (!threadId) {
      return res.status(400).json({
        success: false,
        message: "threadId parameter is required"
      });
    }

    // Fetch messages in chronological order
    const messages = await MailMessage.find({ threadId })
      .sort({ createdAt: 1 });

    // Mark unread inbound messages as read
    await MailMessage.updateMany(
      { threadId, direction: "inbound", isRead: false },
      { $set: { isRead: true } }
    );

    res.status(200).json({
      success: true,
      data: messages
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch messages for thread",
      error: error.message
    });
  }
};

/**
 * Send an outbound email and save to database
 */
export const sendMailMessage = async (req, res) => {
  try {
    const { to, subject, text, html, threadId: existingThreadId } = req.body;

    if (!to || !subject || (!text && !html)) {
      return res.status(400).json({
        success: false,
        message: "to, subject, and at least text or html body are required"
      });
    }

    const cleanEmail = extractEmail(to);
    const threadId = existingThreadId || makeThreadId(subject, cleanEmail);

    // Send email using existing Resend utility
    const resendResult = await sendMail({
      to: cleanEmail,
      subject,
      text,
      html
    });

    // Save outbound message to DB
    const outboundMessage = await MailMessage.create({
      from: process.env.RESEND_EMAIL_FROM || "grow@mapharvest.live",
      to: [cleanEmail],
      subject,
      text,
      html,
      direction: "outbound",
      contactEmail: cleanEmail,
      threadId,
      resendId: resendResult?.id || null,
      status: "sent",
      isRead: true
    });

    res.status(201).json({
      success: true,
      message: "Email sent and saved successfully",
      data: outboundMessage
    });
  } catch (error) {
    console.error("❌ sendMailMessage error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send email",
      error: error.message
    });
  }
};

/**
 * Public webhook endpoint for inbound emails from Resend
 * Only processes "email.received" events.
 * Ignores self-sent emails.
 * Strips quoted Gmail chains.
 */
export const receiveInboundWebhook = async (req, res) => {
  try {
    console.log("📬 Inbound email webhook received:", JSON.stringify(req.body, null, 2));

    // ─── 1. Only process "email.received" events ───
    const eventType = req.body?.type;
    if (eventType && eventType !== "email.received") {
      console.log(`⏭️ Ignoring non-received webhook event: ${eventType}`);
      return res.status(200).json({
        success: true,
        message: `Ignored event type: ${eventType}`
      });
    }

    // Handle nested Resend event wrapper payloads
    let emailData = req.body;
    if (req.body && req.body.data && typeof req.body.data === 'object') {
      emailData = req.body.data;
    }

    const { from, to, subject, text: bodyText, html: bodyHtml, email_id: emailId } = emailData;

    if (!from) {
      return res.status(400).json({
        success: false,
        message: "'from' field is required in payload"
      });
    }

    // ─── 2. Ignore emails from our own sending address ───
    const senderEmail = extractEmail(from);
    if (senderEmail === extractEmail(OWN_EMAIL)) {
      console.log(`⏭️ Ignoring self-sent email from: ${from}`);
      return res.status(200).json({
        success: true,
        message: "Ignored self-sent email echo"
      });
    }

    const contactEmail = senderEmail;
    let text = bodyText || "";
    let html = bodyHtml || "";

    // Fetch full email body from Resend if email_id is present
    if (emailId) {
      try {
        console.log(`🔍 Fetching full email content from Resend for ID: ${emailId}`);
        const { data: resendEmail, error: resendError } = await resend.emails.receiving.get(emailId);
        if (resendEmail) {
          text = resendEmail.text || text;
          html = resendEmail.html || html;
          console.log(`✅ Successfully fetched email content for ID: ${emailId}`);
        } else if (resendError) {
          console.error("⚠️ Failed to fetch email details from Resend API:", resendError);
        }
      } catch (err) {
        console.error("⚠️ Error while calling Resend GET email:", err.message);
      }
    }

    // ─── 3. Strip quoted Gmail reply chains ───
    const cleanText = stripQuotedText(text);
    const cleanHtml = stripQuotedHtml(html);

    // ─── 4. Generate threadId from normalized subject + contact ───
    const threadId = makeThreadId(subject, contactEmail);

    // Save inbound message to DB
    const inboundMessage = await MailMessage.create({
      from,
      to: Array.isArray(to) ? to : [to || ""],
      subject: subject || "(No Subject)",
      text: cleanText,
      html: cleanHtml,
      direction: "inbound",
      contactEmail,
      threadId,
      status: "received",
      isRead: false
    });

    res.status(200).json({
      success: true,
      message: "Webhook processed and email saved successfully",
      data: inboundMessage
    });
  } catch (error) {
    console.error("❌ receiveInboundWebhook error:", error);
    res.status(500).json({
      success: false,
      message: "Webhook processing failed",
      error: error.message
    });
  }
};

/**
 * Migration helper: backfill threadId for old documents that don't have it.
 * Call once via /mails/migrate-threads
 */
export const migrateThreadIds = async (req, res) => {
  try {
    const docs = await MailMessage.find({ $or: [{ threadId: { $exists: false } }, { threadId: "" }] });
    let updated = 0;

    for (const doc of docs) {
      const threadId = makeThreadId(doc.subject, doc.contactEmail);
      doc.threadId = threadId;
      await doc.save();
      updated++;
    }

    res.status(200).json({
      success: true,
      message: `Migration complete. Updated ${updated} documents.`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Migration failed",
      error: error.message
    });
  }
};
