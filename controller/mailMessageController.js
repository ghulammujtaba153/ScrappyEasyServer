import MailMessage from "../models/mailMessageSchema.js";
import { sendMail, resend } from "../utils/mailer.js";

// Helper to extract clean email address from formats like "John Doe <john@example.com>"
const extractEmail = (str) => {
  if (!str) return "";
  const match = str.match(/<([^>]+)>/);
  return match ? match[1].trim().toLowerCase() : str.trim().toLowerCase();
};

/**
 * Get all conversation threads (grouped by contactEmail)
 */
export const getMailThreads = async (req, res) => {
  try {
    const threads = await MailMessage.aggregate([
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$contactEmail",
          latestMessage: { $first: "$$ROOT" },
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
 * Get all messages for a specific conversation thread
 */
export const getMailThreadMessages = async (req, res) => {
  try {
    const { email } = req.params;
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email parameter is required"
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Fetch messages
    const messages = await MailMessage.find({ contactEmail: cleanEmail })
      .sort({ createdAt: 1 });

    // Mark inbound messages as read
    await MailMessage.updateMany(
      { contactEmail: cleanEmail, direction: "inbound", isRead: false },
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
    const { to, subject, text, html } = req.body;

    if (!to || !subject || (!text && !html)) {
      return res.status(400).json({
        success: false,
        message: "to, subject, and at least text or html body are required"
      });
    }

    const cleanEmail = extractEmail(to);

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
 * Public webhook endpoint for inbound emails from Resend Inbound Email product
 */
export const receiveInboundWebhook = async (req, res) => {
  try {
    console.log("📬 Inbound email webhook received:", JSON.stringify(req.body, null, 2));

    // Handle nested Resend event wrapper payloads (type: email.received)
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

    const contactEmail = extractEmail(from);
    let text = bodyText || "";
    let html = bodyHtml || "";

    // If an email_id is present, fetch the full email body (text and HTML) from Resend
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

    // Save inbound message to DB
    const inboundMessage = await MailMessage.create({
      from,
      to: Array.isArray(to) ? to : [to || ""],
      subject: subject || "(No Subject)",
      text,
      html,
      direction: "inbound",
      contactEmail,
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
 * Developer helper endpoint to simulate receiving an inbound email
 */
export const simulateInboundMail = async (req, res) => {
  try {
    const { from, subject, text, html } = req.body;

    if (!from || !subject || (!text && !html)) {
      return res.status(400).json({
        success: false,
        message: "from, subject, and either text or html content are required to simulate"
      });
    }

    const contactEmail = extractEmail(from);

    const simulatedMessage = await MailMessage.create({
      from,
      to: [process.env.RESEND_EMAIL_FROM || "grow@mapharvest.live"],
      subject,
      text,
      html,
      direction: "inbound",
      contactEmail,
      status: "received",
      isRead: false
    });

    res.status(201).json({
      success: true,
      message: "Simulated inbound email created successfully",
      data: simulatedMessage
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to simulate inbound email",
      error: error.message
    });
  }
};
