import EmailAccount from '../models/EmailAccount.js';
import { getGmailAuthUrl, exchangeGmailCode, connectSMTP } from '../services/emailAccountService.js';

export async function getAccounts(req, res, next) {
  try {
    const accounts = await EmailAccount.find({ userId: req.user._id, isActive: true })
      .select('-accessToken -refreshToken -smtpPass');
    res.json(accounts);
  } catch (err) {
    next(err);
  }
}

export async function gmailAuthUrl(req, res, next) {
  try {
    const url = getGmailAuthUrl(req.user._id);
    res.json({ url });
  } catch (err) {
    next(err);
  }
}

export async function gmailCallback(req, res, next) {
  try {
    const { code, state } = req.query;
    await exchangeGmailCode(code, state);
    res.redirect(`${process.env.FRONTEND_URL}/dashboard/cold-mail?connected=gmail`);
  } catch (err) {
    next(err);
  }
}

export async function addSmtp(req, res, next) {
  try {
    const { host, port, user, pass, email } = req.body;
    if (!host || !port || !user || !pass || !email)
      return res.status(400).json({ message: 'All SMTP fields are required' });

    const account = await connectSMTP({ host, port, user, pass, email, userId: req.user._id });
    res.status(201).json({ _id: account._id, email: account.email, provider: account.provider });
  } catch (err) {
    next(err);
  }
}

export async function deleteAccount(req, res, next) {
  try {
    await EmailAccount.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { isActive: false }
    );
    res.json({ message: 'Account disconnected' });
  } catch (err) {
    next(err);
  }
}

export async function toggleWarmup(req, res, next) {
  try {
    const account = await EmailAccount.findOne({ _id: req.params.id, userId: req.user._id });
    if (!account) return res.status(404).json({ message: 'Not found' });
    account.warmupEnabled = !account.warmupEnabled;
    await account.save();
    res.json({ warmupEnabled: account.warmupEnabled });
  } catch (err) {
    next(err);
  }
}
