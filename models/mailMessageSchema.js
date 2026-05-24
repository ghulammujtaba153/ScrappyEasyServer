import mongoose from "mongoose";

const mailMessageSchema = new mongoose.Schema(
  {
    from: {
      type: String,
      required: true,
      trim: true,
    },
    to: {
      type: [String],
      required: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    text: {
      type: String,
      required: false,
    },
    html: {
      type: String,
      required: false,
    },
    direction: {
      type: String,
      enum: ["inbound", "outbound"],
      required: true,
    },
    contactEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    // Thread grouping key: normalized subject + contact email
    // e.g. "welcome to map harvest::john@example.com"
    threadId: {
      type: String,
      required: false,
      default: "",
      lowercase: true,
      trim: true,
      index: true,
    },
    resendId: {
      type: String,
      required: false,
      trim: true,
    },
    status: {
      type: String,
      enum: ["received", "sent", "failed"],
      default: "received",
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast thread lookups
mailMessageSchema.index({ threadId: 1, createdAt: 1 });
mailMessageSchema.index({ contactEmail: 1 });

const MailMessage = mongoose.model("MailMessage", mailMessageSchema);

export default MailMessage;
