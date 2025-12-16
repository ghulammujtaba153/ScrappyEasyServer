import mongoose from "mongoose";

const WhatsAppAccountSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true
    },

    // ===============================
    // Embedded Signup / SaaS fields
    // ===============================

    accessToken: {
      type: String,
      required: true
    },

    tokenType: {
      type: String,
      enum: ["system_user"],
      default: "system_user"
    },

    tokenCreatedAt: {
      type: Date,
      default: Date.now
    },

    // ===============================
    // WhatsApp Business data
    // ===============================

    businessManagerId: {
      type: String
    },

    wabaId: {
      type: String,
      required: true
    },

    phoneNumberId: {
      type: String,
      required: true
    },

    displayPhoneNumber: {
      type: String
    },

    // ===============================
    // Connection state
    // ===============================

    connected: {
      type: Boolean,
      default: true
    },

    connectedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

export default mongoose.model("WhatsAppAccount", WhatsAppAccountSchema);
