import { google } from 'googleapis';
import nodemailer from 'nodemailer';
import EmailAccount from '../models/EmailAccount.js';
import { encrypt, decrypt } from '../utils/encryption.js';

// ── Gmail OAuth helpers ───────────────────────────────────────────────────────

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getGmailAuthUrl(userId) {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'],
    state: userId.toString(),
  });
}

export async function exchangeGmailCode(code, userId) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);

  // Fetch user's Gmail address
  client.setCredentials(tokens);
  const gmail = google.gmail({ version: 'v1', auth: client });
  const profile = await gmail.users.getProfile({ userId: 'me' });

  const account = await EmailAccount.create({
    userId,
    provider:     'gmail',
    email:        profile.data.emailAddress,
    displayName:  profile.data.emailAddress,
    accessToken:  encrypt(tokens.access_token),
    refreshToken: encrypt(tokens.refresh_token),
    tokenExpiry:  new Date(tokens.expiry_date),
    dailySendLimit: 500,
  });
  return account;
}

export async function getGmailClient(account) {
  const client = getOAuthClient();
  client.setCredentials({
    access_token:  decrypt(account.accessToken),
    refresh_token: decrypt(account.refreshToken),
    expiry_date:   account.tokenExpiry?.getTime(),
  });

  // Explicitly check and refresh if token is expired (or expiring in < 5 mins)
  if (account.tokenExpiry && account.tokenExpiry.getTime() < Date.now() + 5 * 60 * 1000) {
    try {
      const { credentials } = await client.refreshAccessToken();
      client.setCredentials(credentials);

      if (credentials.access_token) {
        account.accessToken = encrypt(credentials.access_token);
        account.tokenExpiry = new Date(credentials.expiry_date);
        if (credentials.refresh_token) {
          account.refreshToken = encrypt(credentials.refresh_token);
        }
        await account.save();
      }
    } catch (err) {
      console.error(`[emailAccountService] Token refresh failed for ${account._id}:`, err.message);
      throw err;
    }
  }

  // Auto-refresh fallback
  client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      account.accessToken = encrypt(tokens.access_token);
      account.tokenExpiry = new Date(tokens.expiry_date);
      await account.save().catch(console.error);
    }
  });

  return google.gmail({ version: 'v1', auth: client });
}

// ── SMTP helpers ──────────────────────────────────────────────────────────────

export async function connectSMTP({ host, port, user, pass, userId, email }) {
  const transporter = nodemailer.createTransport({
    host, port: Number(port),
    secure: Number(port) === 465,
    auth: { user, pass },
  });
  await transporter.verify();   // throws if invalid

  return EmailAccount.create({
    userId,
    provider:    'smtp',
    email,
    smtpHost:    host,
    smtpPort:    Number(port),
    smtpUser:    user,
    smtpPass:    encrypt(pass),
    dailySendLimit: 200,
  });
}

export function getSMTPTransporter(account) {
  return nodemailer.createTransport({
    host:   account.smtpHost,
    port:   account.smtpPort,
    secure: account.smtpPort === 465,
    auth: {
      user: account.smtpUser,
      pass: decrypt(account.smtpPass),
    },
  });
}

// ── Daily send limit check & reset ───────────────────────────────────────────

export async function canSendToday(account) {
  const today = new Date().toISOString().split('T')[0];
  
  if (account.lastResetDate !== today) {
    account.sentTodayCount = 0;
    account.lastResetDate  = today;
    if (account.warmupEnabled) {
      account.dailySendLimit = Math.min(account.dailySendLimit + 15, 500);
      account.warmupDay += 1;
    }
    await account.save();
  }

  // Atomic check and increment
  const result = await EmailAccount.findOneAndUpdate(
    { _id: account._id, sentTodayCount: { $lt: account.dailySendLimit } },
    { $inc: { sentTodayCount: 1 }, $set: { lastSentAt: new Date() } },
    { new: true }
  );

  return !!result;
}
