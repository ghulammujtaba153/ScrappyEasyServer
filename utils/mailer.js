import { createTransport } from "nodemailer";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const transporter = createTransport({
  host: "smtp.hostinger.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Send email using Nodemailer
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text content
 * @param {string} options.html - HTML content
 * @returns {Promise<Object>} - Nodemailer info object
 */
export const sendMail = async ({ to, subject, text, html }) => {
  try {
    // Logo path
    const logoPath = path.join(__dirname, "..", "public", "map.png");

    const info = await transporter.sendMail({
      from: `"Map Harvest" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html,
      attachments: [
        {
          filename: 'map.png',
          path: logoPath,
          cid: 'logo' // same cid value as in the html img src
        }
      ]
    });
    console.log("✅ Email sent successfully:", info.messageId);
    return info;
  } catch (error) {
    console.error("❌ Error sending email:", error);
    throw error;
  }
};
