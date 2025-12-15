import axios from "axios";

export const sendWhatsAppMessage = async (req, res) => {
  try {
    const { to, message, templateName, templateLanguage } = req.body;

    if (!to) {
      return res.status(400).json({ success: false, error: "Recipient number (to) is required" });
    }

    const url = `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

    let payload = null;

    // ✅ If template name is passed → send template message
    if (templateName) {
      payload = {
        messaging_product: "whatsapp",
        to: to.replace("+", ""), // ensure correct format
        type: "template",
        template: {
          name: templateName,
          language: { code: templateLanguage || "en_US" }
        }
      };

    } else {
      // ❗ Free text only works if user messaged your business number in last 24 hours
      if (!message) {
        return res.status(400).json({ success: false, error: "Message is required for text type" });
      }

      payload = {
        messaging_product: "whatsapp",
        to: to.replace("+", ""),
        type: "text",
        text: { body: message }
      };
    }

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${process.env.TEMPORARY_TOKEN}`,
        "Content-Type": "application/json"
      }
    });

    return res.json({ success: true, data: response.data });

  } catch (err) {
    console.error("WhatsApp Send Error:", err.response?.data || err.message);
    return res.status(500).json({
      success: false,
      error: err.response?.data || err.message
    });
  }
};
