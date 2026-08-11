'use strict';

// Transactional email via the SMTP credentials injected by the host
// (ServerHoster → Cloudflare Email: smtp.mx.cloudflare.net:465, user "api_token").
// All config comes from env; if SMTP is not configured the helpers no-op so
// checkout never breaks in dev/test or on a host without email enabled.
const nodemailer = require('nodemailer');

let cachedTransport;
let triedTransport = false;

function getTransport() {
  if (triedTransport) return cachedTransport;
  triedTransport = true;
  const host = process.env.SMTP_HOST;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !pass) {
    cachedTransport = null; // email not configured — helpers become no-ops
    return null;
  }
  const port = Number(process.env.SMTP_PORT) || 465;
  cachedTransport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = implicit TLS (Cloudflare SMTP)
    auth: { user: process.env.SMTP_USER || 'api_token', pass },
  });
  return cachedTransport;
}

function fromHeader() {
  const from = process.env.SMTP_FROM || '';
  const name = process.env.SMTP_FROM_NAME;
  return name ? `"${name}" <${from}>` : from;
}

function formatDKK(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  try {
    return new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK' }).format(n);
  } catch {
    return `${n} kr.`;
  }
}

/**
 * Send a "we received your order" confirmation to the buyer. Best-effort:
 * callers should not await-block the HTTP response on it, and should .catch().
 */
async function sendOrderConfirmation({ to, name, reference, totalIncVat }) {
  const transport = getTransport();
  if (!transport || !to) return { skipped: true };
  const total = formatDKK(totalIncVat);
  const greeting = name ? `Hej ${name},` : 'Hej,';
  const text = [
    greeting,
    '',
    'Tak for din bestilling hos Kursusplads.',
    `Vi har modtaget din ordre ${reference}.`,
    total ? `Samlet beløb inkl. moms: ${total}.` : '',
    '',
    'Din ordre behandles nu, og vi vender tilbage med bekræftelse og betalingsdetaljer.',
    '',
    'Venlig hilsen',
    'Kursusplads',
  ].filter((line) => line !== null && line !== undefined).join('\n');
  return transport.sendMail({
    from: fromHeader(),
    to,
    replyTo: process.env.SMTP_FROM || undefined,
    subject: `Ordrebekræftelse – ${reference}`,
    text,
  });
}

module.exports = { getTransport, sendOrderConfirmation };
