import mongoose from 'mongoose';

const stepSchema = new mongoose.Schema({
  subject:       { type: String, required: true },
  body:          { type: String, required: true },   // HTML string
  delayDays:     { type: Number, default: 0 },        // days after previous step
  sendCondition: { type: String, enum: ['always', 'no_reply'], default: 'always' },
});

const campaignSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  accountIds:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'EmailAccount', required: true }],
  name:         { type: String, required: true },
  status:       { type: String, enum: ['draft','active','paused','completed'], default: 'draft' },

  contactsCount:{ type: Number, default: 0 },
  steps:        [stepSchema],

  schedule: {
    startDate:  { type: Date, default: null }, // when to start the campaign
    timezone:   { type: String, default: 'UTC' },
    daysOfWeek: { type: [Number], default: [1,2,3,4,5] }, // 0=Sun
    startHour:  { type: Number, default: 9 },
    endHour:    { type: Number, default: 17 },
  },

  stats: {
    sent:         { type: Number, default: 0 },
    opened:       { type: Number, default: 0 },
    clicked:      { type: Number, default: 0 },
    replied:      { type: Number, default: 0 },
    bounced:      { type: Number, default: 0 },
    unsubscribed: { type: Number, default: 0 },
  },
}, { timestamps: true });

campaignSchema.index({ userId: 1, status: 1 });
campaignSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('ColdCampaign', campaignSchema);
