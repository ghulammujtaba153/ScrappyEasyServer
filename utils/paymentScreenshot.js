/** Resolve payment proof from Cloudinary URL (preferred) or legacy disk upload. */
export function resolvePaymentScreenshot(req) {
  const fromBody = req.body?.paymentScreenshot;
  if (typeof fromBody === 'string') {
    const trimmed = fromBody.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
  }
  if (req.file?.filename) {
    return req.file.filename;
  }
  return null;
}
