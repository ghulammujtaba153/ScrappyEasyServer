import mongoose from 'mongoose';

const emailEventSchema = new mongoose.Schema({
  campaignId:  { type: mongoose.Schema.Types.ObjectId, ref: 'ColdCampaign' },
  contactId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  accountId:   { type: mongoose.Schema.Types.ObjectId, ref: 'EmailAccount' },
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  stepIndex:   { type: Number, default: 0 },
  messageId:   { type: String },   // provider message ID
  status:      { type: String, enum: ['queued','sent','opened','clicked','replied','bounced','failed','unsubscribed'], default: 'queued' },
  openedAt:    { type: Date },
  clickedAt:   { type: Date },
  clickedUrl:  { type: String },
  failReason:  { type: String },
}, { timestamps: true });

// Compound indexes for fast scheduler and stat lookups
emailEventSchema.index({ campaignId: 1, contactId: 1, stepIndex: 1 }, { unique: true });
emailEventSchema.index({ campaignId: 1, status: 1 });
emailEventSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('EmailEvent', emailEventSchema);
