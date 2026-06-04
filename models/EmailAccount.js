import mongoose from 'mongoose';

const emailAccountSchema = new mongoose.Schema({
  userId:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  provider:         { type: String, enum: ['gmail', 'smtp'], required: true },
  email:            { type: String, required: true },
  displayName:      { type: String },

  // Gmail OAuth fields
  accessToken:      { type: String },   // encrypted
  refreshToken:     { type: String },   // encrypted
  tokenExpiry:      { type: Date },

  // SMTP fields
  smtpHost:         { type: String },
  smtpPort:         { type: Number },
  smtpUser:         { type: String },
  smtpPass:         { type: String },   // encrypted

  // Sending limits
  dailySendLimit:   { type: Number, default: 50 },
  sentTodayCount:   { type: Number, default: 0 },
  lastSentAt:       { type: Date },
  lastResetDate:    { type: String },   // 'YYYY-MM-DD' — reset sentTodayCount daily

  // Warmup
  warmupEnabled:    { type: Boolean, default: false },
  warmupDay:        { type: Number,  default: 1 },

  isActive:         { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model('EmailAccount', emailAccountSchema);
