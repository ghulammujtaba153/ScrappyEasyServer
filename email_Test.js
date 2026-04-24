import { sendMail } from "./utils/mailer.js";
import { getSubscriptionActiveTemplate, getSubscriptionActiveText } from "./utils/templates/subscription.js";

async function testPaymentConfirmation() {
  try {
    const to = "ghulammujtaba.dro@gmail.com";
    const name = "Ghulam Mujtaba";
    const planName = "Pro Yearly Plan";
    const amount = "$199.00";
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    const loginLink = `${process.env.CLIENT_URL}/login`;
    
    const info = await sendMail({
      to,
      subject: "Your Map Harvest Subscription is Now Active!",
      text: getSubscriptionActiveText(name, planName),
      html: getSubscriptionActiveTemplate(name, planName, amount, expiryDate, loginLink)
    });

    console.log("✅ Payment confirmation test email sent successfully!");
    console.log("Message ID: %s", info.messageId);
  } catch (error) {
    console.error("❌ Test email failed:", error);
  }
}

testPaymentConfirmation();