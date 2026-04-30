import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.RESEND_API_KEY) {
  console.error("❌ CRITICAL: RESEND_API_KEY is missing in environment variables!");
}

if (!process.env.RESEND_EMAIL_FROM) {
  console.error("❌ CRITICAL: RESEND_EMAIL_FROM is missing in environment variables!");
}

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Send email using Resend
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email (or array of emails)
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text content (optional if html provided)
 * @param {string} options.html - HTML content
 * @returns {Promise<Object>} - Resend response { id }
 */
export const sendMail = async ({ to, subject, text, html }) => {
  try {
    const { data, error } = await resend.emails.send({
      from: `Map Harvest <${process.env.RESEND_EMAIL_FROM}>`,
      to: Array.isArray(to) ? to : [to],
      subject,
      ...(html ? { html } : {}),
      ...(text ? { text } : {}),
    });

    if (error) {
      console.error("❌ Resend API error:", error);
      throw new Error(error.message || "Failed to send email via Resend");
    }

    console.log("✅ Email sent successfully via Resend. ID:", data.id);
    return data;
  } catch (error) {
    console.error("❌ Error sending email:", error);
    throw error;
  }
};
