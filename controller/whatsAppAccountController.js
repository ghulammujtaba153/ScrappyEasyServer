import axios from "axios";
import jwt from "jsonwebtoken";
import WhatsAppAccount from "../models/whatsAppAccountSchema.js";

/**
 * ============================================================
 * 1️⃣ Embedded Signup OAuth Callback
 * Meta redirects here after user completes Embedded Signup
 * ============================================================
 */
export const embeddedSignupCallback = async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.redirect(
        `${process.env.FRONTEND_URL}/dashboard/whatsapp-automation?error=missing_code`
      );
    }

    // Decode user from state (JWT you created earlier)
    let userId;
    try {
      const decoded = jwt.verify(state, process.env.JWT_SECRET);
      userId = decoded.id;
    } catch (err) {
      return res.redirect(
        `${process.env.FRONTEND_URL}/dashboard/whatsapp-automation?error=invalid_state`
      );
    }

    /**
     * ------------------------------------------------------------
     * Exchange AUTH CODE → ACCESS TOKEN
     * ------------------------------------------------------------
     */
    const tokenResp = await axios.get(
      "https://graph.facebook.com/v20.0/oauth/access_token",
      {
        params: {
          client_id: process.env.FB_APP_ID,
          client_secret: process.env.FB_APP_SECRET,
          redirect_uri: process.env.FB_REDIRECT_URI,
          code
        }
      }
    );

    const accessToken = tokenResp.data.access_token;

    /**
     * ------------------------------------------------------------
     * Get WhatsApp Business Accounts for this user
     * ------------------------------------------------------------
     */
    const wabaResp = await axios.get(
      "https://graph.facebook.com/v20.0/me/whatsapp_business_accounts",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    if (!wabaResp.data.data || wabaResp.data.data.length === 0) {
      throw new Error("No WhatsApp Business Account found");
    }

    const wabaId = wabaResp.data.data[0].id;

    /**
     * ------------------------------------------------------------
     * Get Phone Numbers for WABA
     * ------------------------------------------------------------
     */
    const phoneResp = await axios.get(
      `https://graph.facebook.com/v20.0/${wabaId}/phone_numbers`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    if (!phoneResp.data.data || phoneResp.data.data.length === 0) {
      throw new Error("No phone number found in WABA");
    }

    const phone = phoneResp.data.data[0];

    /**
     * ------------------------------------------------------------
     * Store per-user WhatsApp connection (SaaS SAFE)
     * ------------------------------------------------------------
     */
    await WhatsAppAccount.findOneAndUpdate(
      { userId },
      {
        userId,
        wabaId,
        phoneNumberId: phone.id,
        displayPhoneNumber: phone.display_phone_number,
        accessToken,
        tokenType: "embedded_signup",
        connected: true,
        connectedAt: new Date()
      },
      { upsert: true, new: true }
    );

    res.redirect(
      `${process.env.FRONTEND_URL}/dashboard/whatsapp-automation?connected=true`
    );

  } catch (err) {
    console.error("Embedded Signup Error:", err.response?.data || err.message);
    res.redirect(
      `${process.env.FRONTEND_URL}/dashboard/whatsapp-automation?error=signup_failed`
    );
  }
};

/**
 * ============================================================
 * 2️⃣ Get Connected WhatsApp Account (Frontend Status)
 * ============================================================
 */
export const getConnectedAccount = async (req, res) => {
  try {
    const account = await WhatsAppAccount.findOne({ userId: req.userId });

    if (!account) {
      return res.json({ success: true, connected: false });
    }

    res.json({
      success: true,
      connected: true,
      data: {
        wabaId: account.wabaId,
        phoneNumberId: account.phoneNumberId,
        displayPhoneNumber: account.displayPhoneNumber
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * ============================================================
 * 3️⃣ Send WhatsApp Template Message
 * ============================================================
 */
export const sendMessage = async (req, res) => {
  try {
    const { to, templateName } = req.body;

    if (!to) {
      return res.status(400).json({ success: false, error: "Recipient required" });
    }

    const account = await WhatsAppAccount.findOne({ userId: req.userId });

    if (!account?.phoneNumberId || !account?.accessToken) {
      return res.status(400).json({
        success: false,
        error: "WhatsApp not connected"
      });
    }

    const url = `https://graph.facebook.com/v20.0/${account.phoneNumberId}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName || "hello_world",
        language: { code: "en_US" }
      }
    };

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        "Content-Type": "application/json"
      }
    });

    res.json({ success: true, data: response.data });

  } catch (err) {
    console.error("Send Message Error:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data || err.message
    });
  }
};
