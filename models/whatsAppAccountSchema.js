import mongoose from "mongoose";

const WhatsAppAccountSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true
  },

  fbUserId: { type: String },

  accessToken: { type: String, required: true }, // long-lived token
  tokenExpiresIn: { type: Number },
  tokenCreatedAt: { type: Date, default: Date.now },

  businessId: { type: String },
  wabaId: { type: String },

  phoneNumberId: { type: String },
  displayPhoneNumber: { type: String },

  connected: { type: Boolean, default: false }
});

const WhatsAppAccount =mongoose.model("WhatsAppAccount", WhatsAppAccountSchema);
export default WhatsAppAccount;
