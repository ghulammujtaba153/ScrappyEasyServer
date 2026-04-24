import { baseLayout } from "./baseLayout.js";

/**
 * Generate Team Invitation email
 */
export const getTeamInviteTemplate = (senderName, teamName, inviteLink) => {
  const content = `
    <p>Hello!</p>
    <p><strong class="highlight">${senderName}</strong> has invited you to join their team <strong class="highlight">"${teamName}"</strong> on Map Harvest.</p>
    <p>As a team member, you'll be able to collaborate on lead scraping and management tasks.</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${inviteLink}" class="button">Accept Invitation</a>
    </div>
    
    <p>Click the button above to accept the invitation and set up your account. This link will expire in 7 days.</p>
    <p style="font-size: 13px; color: #718096; word-break: break-all;">
      Or copy and paste this link: <br>
      <a href="${inviteLink}" style="color: #0F792C;">${inviteLink}</a>
    </p>
  `;

  return baseLayout("Team Invitation", content);
};

export const getTeamInviteText = (senderName, teamName, inviteLink) => {
  return `
Hello!

${senderName} has invited you to join their team "${teamName}" on Map Harvest.

Accept Invitation: ${inviteLink}

This link will expire in 7 days.

© ${new Date().getFullYear()} Map Harvest. All rights reserved.
  `.trim();
};
