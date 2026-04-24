import { baseLayout } from "./baseLayout.js";

/**
 * Generate Subscription Activation email
 */
export const getSubscriptionActiveTemplate = (userName, planName, amount, expiryDate, loginLink) => {
  const content = `
    <p>Hello <strong class="highlight">${userName}</strong>,</p>
    <p>Great news! Your subscription has been verified and activated. You now have full access to our premium features.</p>
    
    <div style="background-color: #f7fafc; border: 1px solid #edf2f7; border-radius: 8px; padding: 20px; margin: 25px 0;">
      <h3 style="margin-top: 0; color: #2d3748; font-size: 16px;">Plan Details:</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 5px 0; color: #718096;">Plan:</td>
          <td style="padding: 5px 0; text-align: right; font-weight: 600;">${planName || 'Pro'}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #718096;">Status:</td>
          <td style="padding: 5px 0; text-align: right; color: #0F792C; font-weight: 600;">Active</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #718096;">Amount:</td>
          <td style="padding: 5px 0; text-align: right; font-weight: 600;">${amount || 'Verified'}</td>
        </tr>
        ${expiryDate ? `
        <tr>
          <td style="padding: 5px 0; color: #718096;">Expiry Date:</td>
          <td style="padding: 5px 0; text-align: right; font-weight: 600;">${new Date(expiryDate).toLocaleDateString()}</td>
        </tr>
        ` : `
        <tr>
          <td style="padding: 5px 0; color: #718096;">Access:</td>
          <td style="padding: 5px 0; text-align: right; font-weight: 600;">Lifetime</td>
        </tr>
        `}
      </table>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${loginLink}" class="button">Go to Dashboard</a>
    </div>
    
    <p>Thank you for choosing Map Harvest! If you have any questions, feel free to reply to this email.</p>
  `;

  return baseLayout("Subscription Activated!", content);
};

export const getSubscriptionActiveText = (userName, planName) => {
  return `
Hello ${userName},

Your ${planName || 'Pro'} subscription has been verified and activated.

You can now log in and access all the premium tools.

Log in here: ${process.env.CLIENT_URL}/login

© ${new Date().getFullYear()} Map Harvest. All rights reserved.
  `.trim();
};
