import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  email:        { type: String, required: true },
  firstName:    { type: String, default: '' },
  lastName:     { type: String, default: '' },
  company:      { type: String, default: '' },
  customFields: { type: Map, of: String, default: {} },
  unsubscribed: { type: Boolean, default: false },
  bounced:      { type: Boolean, default: false },
}, { timestamps: true });

contactSchema.index({ userId: 1, email: 1 }, { unique: true });

export default mongoose.model('Contact', contactSchema);
