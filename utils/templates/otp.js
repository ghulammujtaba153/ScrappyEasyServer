import { baseLayout } from "./baseLayout.js";

/**
 * Generate OTP email HTML template
 * @param {string} otp - The OTP code
 * @param {string} userName - Optional user name
 * @returns {string} HTML email template
 */
export const getOtpEmailTemplate = (otp, userName = '') => {
  const content = `
    <p>Hello${userName ? ` ${userName}` : ''},</p>
    <p>We received a request to verify your account. Please use the following 6-digit code to complete the process:</p>
    
    <div style="text-align: center; margin: 35px 0;">
      <div style="display: inline-block; background-color: #f0fff4; border: 2px solid #0F792C; border-radius: 10px; padding: 15px 35px;">
        <span style="font-size: 32px; font-weight: 700; color: #0F792C; letter-spacing: 6px; font-family: 'Courier New', monospace;">
          ${otp}
        </span>
      </div>
    </div>
    
    <p style="text-align: center; color: #718096; font-size: 14px;">
      This code will expire in <strong style="color: #c53030;">10 minutes</strong>.
    </p>
    <p>If you did not request this verification, you can safely ignore this email.</p>
  `;

  return baseLayout("OTP Verification", content);
};

/**
 * Generate plain text version of OTP email
 */
export const getOtpEmailText = (otp, userName = '') => {
  return `
Hello${userName ? ` ${userName}` : ''},

Your OTP verification code is: ${otp}

This code will expire in 10 minutes.

If you didn't request this code, please ignore this email.

© ${new Date().getFullYear()} Map Harvest. All rights reserved.
  `.trim();
};
