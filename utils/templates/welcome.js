import { baseLayout } from "./baseLayout.js";

/**
 * Generate generic Welcome email
 */
export const getWelcomeTemplate = (userName) => {
  const content = `
    <p>Hello${userName ? ` <strong class="highlight">${userName}</strong>` : ''},</p>
    <p>Welcome to <strong class="highlight">Map Harvest</strong>! We're thrilled to have you join our community.</p>
    <p>Our platform is designed to help you extract valuable leads and manage them efficiently. We're excited to see what you'll achieve with our tools.</p>
    
    <div style="background-color: #f0fff4; border: 1px solid #c6f6d5; border-radius: 8px; padding: 15px; margin: 20px 0; border-left: 4px solid #0F792C;">
      <p style="margin: 0; color: #2d3748; font-size: 15px;">
        <strong>Important:</strong> Your account is currently under review. You will be able to log in and access all features once your <strong>payment has been verified</strong> by our team.
      </p>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${process.env.CLIENT_URL}" class="button">Visit Website</a>
    </div>
    
    <p>If you have any questions or need assistance, our support team is always here to help.</p>
    <p>Best regards,<br><strong>The Map Harvest Team</strong></p>
  `;

  return baseLayout("Welcome to the Community!", content);
};

export const getWelcomeText = (userName) => {
  return `
Hello${userName ? ` ${userName}` : ''},

Welcome to Map Harvest! Thanks for joining our community. We're excited to have you on board.

Important: Your account is currently under review. You will be able to log in and access all features once your payment has been verified by our team.

Visit Website: ${process.env.CLIENT_URL}

Best regards,
Map Harvest Team

© ${new Date().getFullYear()} Map Harvest. All rights reserved.
  `.trim();
};
