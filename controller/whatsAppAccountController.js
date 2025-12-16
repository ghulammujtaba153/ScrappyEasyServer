import axios from "axios";
import jwt from "jsonwebtoken";
import WhatsAppAccount from "../models/whatsAppAccountSchema.js";

/**
 * ============================================================
 * 1️⃣ Embedded Signup OAuth Callback (CORRECT)
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

    // Decode SaaS user from state
    let userId;
    try {
      const decoded = jwt.verify(state, process.env.JWT_SECRET);
      userId = decoded.id;
    } catch {
      return res.redirect(
        `${process.env.FRONTEND_URL}/dashboard/whatsapp-automation?error=invalid_state`
      );
    }

    /**
     * ------------------------------------------------------------
     * 1️⃣ Exchange AUTH CODE → SYSTEM USER TOKEN
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

    const systemUserToken = tokenResp.data.access_token;

    /**
     * ------------------------------------------------------------
     * 2️⃣ Fetch Embedded Signup Session Info (CRITICAL)
     * ------------------------------------------------------------
     * This returns:
     * - business_manager_id
     * - waba_id
     * - phone_number_id
     */
    const sessionResp = await axios.get(
      "https://graph.facebook.com/v20.0/me",
      {
        headers: {
          Authorization: `Bearer ${systemUserToken}`
        },
        params: {
          fields: "id,whatsapp_business_accounts{ id,phone_numbers{ id,display_phone_number } }"
        }
      }
    );

    const waba =
      sessionResp.data.whatsapp_business_accounts?.data?.[0];

    if (!waba) {
      throw new Error("No WABA returned from Embedded Signup");
    }

    const phone = waba.phone_numbers?.data?.[0];

    if (!phone) {
      throw new Error("No phone number returned from Embedded Signup");
    }

    /**
     * ------------------------------------------------------------
     * 3️⃣ Store SaaS-SAFE WhatsApp connection
     * ------------------------------------------------------------
     */
    await WhatsAppAccount.findOneAndUpdate(
      { userId },
      {
        userId,
        accessToken: systemUserToken,
        tokenType: "system_user",
        wabaId: waba.id,
        phoneNumberId: phone.id,
        displayPhoneNumber: phone.display_phone_number,
        connected: true,
        connectedAt: new Date()
      },
      { upsert: true, new: true }
    );

    return res.redirect(
      `${process.env.FRONTEND_URL}/dashboard/whatsapp-automation?connected=true`
    );

  } catch (err) {
    console.error("Embedded Signup Error:", err.response?.data || err.message);
    return res.redirect(
      `${process.env.FRONTEND_URL}/dashboard/whatsapp-automation?error=signup_failed`
    );
  }
};

/**
 * ============================================================
 * 2️⃣ Get Connected Account (Frontend status)
 * ============================================================
 */
export const getConnectedAccount = async (req, res) => {
  try {
    const account = await WhatsAppAccount.findOne({ userId: req.userId });

    if (!account) {
      return res.json({ success: true, connected: false });
    }

    return res.json({
      success: true,
      connected: true,
      data: {
        wabaId: account.wabaId,
        phoneNumberId: account.phoneNumberId,
        displayPhoneNumber: account.displayPhoneNumber
      }
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

/**
 * ============================================================
 * 3️⃣ Send WhatsApp Template Message (CORRECT)
 * ============================================================
 */
export const sendMessage = async (req, res) => {
  try {
    const { to, templateName } = req.body;

    if (!to) {
      return res.status(400).json({
        success: false,
        error: "Recipient required"
      });
    }

    const account = await WhatsAppAccount.findOne({ userId: req.userId });

    if (!account?.accessToken || !account?.phoneNumberId) {
      return res.status(400).json({
        success: false,
        error: "WhatsApp not connected"
      });
    }

    const response = await axios.post(
      `https://graph.facebook.com/v20.0/${account.phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName || "hello_world",
          language: { code: "en_US" }
        }
      },
      {
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );

    return res.json({
      success: true,
      data: response.data
    });

  } catch (err) {
    console.error("Send Message Error:", err.response?.data || err.message);
    return res.status(500).json({
      success: false,
      error: err.response?.data || err.message
    });
  }
};
