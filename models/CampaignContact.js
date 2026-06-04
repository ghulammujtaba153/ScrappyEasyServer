import mongoose from 'mongoose';

const campaignContactSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'ColdCampaign', required: true },
  contactId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: true },
});

// Fast lookup for finding contacts in a campaign, and preventing duplicates
campaignContactSchema.index({ campaignId: 1, contactId: 1 }, { unique: true });

export default mongoose.model('CampaignContact', campaignContactSchema);
