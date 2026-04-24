import { baseLayout } from "./baseLayout.js";

/**
 * Generate Admin/Dashboard Invitation email
 */
export const getAdminInviteTemplate = (userName, resetLink) => {
  const content = `
    <p>Hello <strong class="highlight">${userName || 'there'}</strong>!</p>
    <p>You have been invited to join the Map Harvest dashboard platform.</p>
    <p>To get started, please click the button below to set your password and activate your account:</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetLink}" class="button">Set Your Password</a>
    </div>
    
    <p>This invitation link will expire in 24 hours.</p>
    <p style="font-size: 13px; color: #718096; word-break: break-all;">
      If the button doesn't work, copy and paste this link: <br>
      <a href="${resetLink}" style="color: #0F792C;">${resetLink}</a>
    </p>
    <p>Welcome to the team!</p>
  `;

  return baseLayout("Welcome to Map Harvest!", content);
};

export const getAdminInviteText = (userName, resetLink) => {
  return `
Hello ${userName || 'there'}!

You have been invited to join the Map Harvest dashboard.

Click the link below to set your password and activate your account:
${resetLink}

This link will expire in 24 hours.

© ${new Date().getFullYear()} Map Harvest. All rights reserved.
  `.trim();
};
