import { bufferOpen, bufferClick } from '../services/trackingBuffer.js';

// 1×1 transparent GIF bytes
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

export async function trackOpen(req, res, next) {
  const { eid } = req.query;
  // Fire-and-forget into Redis — never blocks the pixel response
  if (eid) bufferOpen(eid).catch(() => {});
  res.set('Content-Type', 'image/gif');
  res.send(PIXEL);
}

export async function trackClick(req, res, next) {
  const { eid, url } = req.query;
  // Fire-and-forget into Redis — redirect happens instantly
  if (eid && url) bufferClick(eid, url).catch(() => {});
  res.redirect(decodeURIComponent(url));
}


export async function trackUnsubscribe(req, res, next) {
  const { uid } = req.query;
  try {
    await Contact.findByIdAndUpdate(uid, { unsubscribed: true });
    const event = await EmailEvent.findById(req.query.eid);
    if (event) {
      event.status = 'unsubscribed';
      await event.save();
      await ColdCampaign.findByIdAndUpdate(event.campaignId, { $inc: { 'stats.unsubscribed': 1 } });
    }
  } catch (_) {}
  res.send('<h2 style="font-family:sans-serif;text-align:center;margin-top:80px">You have been unsubscribed.</h2>');
}
