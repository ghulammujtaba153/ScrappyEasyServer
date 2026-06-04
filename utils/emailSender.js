import { google } from 'googleapis';
import { getGmailClient, getSMTPTransporter } from '../services/emailAccountService.js';
import EmailAccount from '../models/EmailAccount.js';

export function parseSpintax(text) {
  if (!text) return text;
  let result = text;
  while (/\{([^{}]+)\}/.test(result)) {
    result = result.replace(/\{([^{}]+)\}/g, (match, p1) => {
      const options = p1.split('|');
      return options[Math.floor(Math.random() * options.length)];
    });
  }
  return result;
}

export function interpolate(template, contact) {
  if (!template) return '';
  let str = parseSpintax(template);
  return str
    .replace(/{{firstName}}/g,  contact.firstName  || '')
    .replace(/{{lastName}}/g,   contact.lastName   || '')
    .replace(/{{company}}/g,    contact.company    || '')
    .replace(/{{email}}/g,      contact.email      || '')
    .replace(/{{(\w+)}}/g, (_, key) => contact.customFields?.get(key) || '');
}

export function buildHtml({ body, trackingPixelUrl, unsubscribeUrl, eventId }) {
  let trackedBody = body;
  
  if (eventId) {
    trackedBody = body.replace(/href=["'](https?:\/\/[^"']+)["']/gi, (match, url) => {
      const trackingUrl = `${process.env.APP_BASE_URL}/api/track/click?eid=${eventId}&url=${encodeURIComponent(url)}`;
      return `href="${trackingUrl}"`;
    });
  }

  return `
    ${trackedBody}
    <br/><br/>
    <small style="color:#999">
      <a href="${unsubscribeUrl}" style="color:#999">Unsubscribe</a>
    </small>
    <img src="${trackingPixelUrl}" width="1" height="1" style="display:none"/>
  `;
}

export async function sendEmail({ accountId, to, subject, htmlBody, textBody, unsubscribeUrl }) {
  const account = await EmailAccount.findById(accountId);
  if (!account) throw new Error('Email account not found');

  if (account.provider === 'gmail') {
    const gmail = await getGmailClient(account);
    let rawStr = `To: ${to}\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\n`;
    if (unsubscribeUrl) {
      rawStr += `List-Unsubscribe: <${unsubscribeUrl}>\r\n`;
    }
    rawStr += `Content-Type: text/html; charset=utf-8\r\n\r\n${htmlBody}`;
    
    const raw = Buffer.from(rawStr).toString('base64url');
    const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    return res.data.id;
  }

  if (account.provider === 'smtp') {
    const transporter = getSMTPTransporter(account);
    const mailOptions = {
      from:    `${account.displayName || account.email} <${account.email}>`,
      to, subject,
      html:    htmlBody,
      text:    textBody || 'Please view this email in an HTML-compatible client.',
    };
    if (unsubscribeUrl) {
      mailOptions.headers = { 'List-Unsubscribe': `<${unsubscribeUrl}>` };
    }
    const info = await transporter.sendMail(mailOptions);
    return info.messageId;
  }

  throw new Error(`Unknown provider: ${account.provider}`);
}
