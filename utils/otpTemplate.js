/**
 * Generate OTP email HTML template
 * @param {string} otp - The OTP code
 * @param {string} userName - Optional user name
 * @returns {string} HTML email template
 */
export const getOtpEmailTemplate = (otp, userName = '') => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OTP Verification</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 30px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">🔐 OTP Verification</h1>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Hello${userName ? ` ${userName}` : ''},
              </p>
              <p style="margin: 0 0 30px 0; color: #666666; font-size: 15px; line-height: 1.6;">
                Please use the following verification code to complete your request:
              </p>
              
              <!-- OTP Code Box -->
              <div style="text-align: center; margin: 30px 0;">
                <div style="display: inline-block; background-color: #f8f9fa; border: 2px dashed #667eea; border-radius: 8px; padding: 20px 40px;">
                  <p style="margin: 0; font-size: 36px; font-weight: 700; color: #667eea; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                    ${otp}
                  </p>
                </div>
              </div>
              
              <!-- Expiry Warning -->
              <p style="margin: 30px 0 0 0; color: #999999; font-size: 13px; line-height: 1.6; text-align: center;">
                This code will expire in <strong style="color: #e74c3c;">10 minutes</strong>.
              </p>
              <p style="margin: 20px 0 0 0; color: #999999; font-size: 12px; line-height: 1.6; text-align: center;">
                If you didn't request this code, please ignore this email.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 30px; background-color: #f8f9fa; text-align: center; border-top: 1px solid #e9ecef;">
              <p style="margin: 0; color: #999999; font-size: 12px;">
                © ${new Date().getFullYear()} ${process.env.BREVO_SENDER_NAME || 'Scraper Dashboard'}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
};

/**
 * Generate plain text version of OTP email
 * @param {string} otp - The OTP code
 * @param {string} userName - Optional user name
 * @returns {string} Plain text email content
 */
export const getOtpEmailText = (otp, userName = '') => {
  return `
Hello${userName ? ` ${userName}` : ''},

Your OTP verification code is: ${otp}

This code will expire in 10 minutes.

If you didn't request this code, please ignore this email.

© ${new Date().getFullYear()} ${process.env.BREVO_SENDER_NAME || 'Scraper Dashboard'}. All rights reserved.
    `.trim();
};
