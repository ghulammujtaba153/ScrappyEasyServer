import { baseLayout } from "./baseLayout.js";

/**
 * Welcome email for International registrations
 */
export const getInternationalWelcomeTemplate = (userName) => {
  const content = `
    <p>Hello${userName ? ` <strong class="highlight">${userName}</strong>` : ''},</p>
    <p>Welcome to <strong class="highlight">Map Harvest</strong>! We're glad to have you on board.</p>
    <p>Your registration has been received. Since you selected an <strong>International</strong> payment region, our admin team will review your account and send you a separate email with your payment link shortly.</p>

    <div style="background-color: #f0fff4; border: 1px solid #c6f6d5; border-radius: 8px; padding: 15px; margin: 20px 0; border-left: 4px solid #0F792C;">
      <p style="margin: 0; color: #2d3748; font-size: 15px;">
        <strong>Important:</strong> Please wait for the payment link email from our admin team. Your account will remain under review until payment is verified.
      </p>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${process.env.CLIENT_URL}" class="button">Visit Website</a>
    </div>

    <p>If you have any questions, feel free to reply to this email and our support team will help you.</p>
    <p>Best regards,<br><strong>The Map Harvest Team</strong></p>
  `;

  return baseLayout("Welcome to Map Harvest!", content);
};

export const getInternationalWelcomeText = (userName) => {
  return `
Hello${userName ? ` ${userName}` : ''},

Welcome to Map Harvest! Thanks for registering.

Your registration has been received. Since you selected an International payment region, our admin team will review your account and send you a separate email with your payment link shortly.

Important: Please wait for the payment link email from our admin team. Your account will remain under review until payment is verified.

Visit Website: ${process.env.CLIENT_URL}

Best regards,
Map Harvest Team

© ${new Date().getFullYear()} Map Harvest. All rights reserved.
  `.trim();
};