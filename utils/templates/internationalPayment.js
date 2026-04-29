import { baseLayout } from "./baseLayout.js";

/**
 * Generate International Payment Instruction email
 */
export const getInternationalPaymentTemplate = (userName, paymentLink) => {
  const link = paymentLink || process.env.INTERNATIONAL_PAYMENT_LINK || process.env.CLIENT_URL;

  const content = `
    <p>Hello <strong class="highlight">${userName || 'there'}</strong>,</p>
    <p>Thank you for registering with <strong class="highlight">Map Harvest</strong>.</p>
    <p>Because your payment region is set to <strong>International</strong>, please complete your subscription using the secure payment link below.</p>

    <div style="background-color: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 25px 0;">
      <h3 style="margin-top: 0; color: #2d3748; font-size: 16px;">Payment Instructions</h3>
      <ol style="margin: 0; padding-left: 20px; color: #475569; line-height: 1.8;">
        <li>Open the secure payment link below.</li>
        <li>Complete the payment for your selected plan.</li>
        <li>Send us the payment screenshot so our team can verify it.</li>
        <li>Once verified, we will activate your account status.</li>
      </ol>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${link}" class="button">Complete Payment</a>
    </div>

    <p style="font-size: 13px; color: #64748b; word-break: break-word;">
      If the button does not work, copy and paste this link:<br>
      <a href="${link}" style="color: #0F792C;">${link}</a>
    </p>

    <div style="background-color: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 15px; margin: 20px 0; border-left: 4px solid #f59e0b;">
      <p style="margin: 0; color: #7c2d12; font-size: 14px;">
        <strong>Important:</strong> Your account will remain under review until payment verification is complete.
      </p>
    </div>

    <p>If you have any questions, reply to this email and our team will assist you.</p>
    <p>Best regards,<br><strong>The Map Harvest Team</strong></p>
  `;

  return baseLayout("Complete Your International Payment", content);
};

export const getInternationalPaymentText = (userName, paymentLink) => {
  const link = paymentLink || process.env.INTERNATIONAL_PAYMENT_LINK || process.env.CLIENT_URL;

  return `
Hello ${userName || 'there'},

Thank you for registering with Map Harvest.

Because your payment region is set to International, please complete your subscription using the secure payment link below:
${link}

Instructions:
1. Open the secure payment link.
2. Complete the payment for your selected plan.
3. Send us the payment screenshot so our team can verify it.
4. Once verified, we will activate your account status.

Important: Your account will remain under review until payment verification is complete.

Best regards,
The Map Harvest Team

© ${new Date().getFullYear()} Map Harvest. All rights reserved.
  `.trim();
};