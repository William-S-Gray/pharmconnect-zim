import nodemailer from 'nodemailer';
import { env, emailConfigured } from '../env.js';

/**
 * Outbound email.
 *
 * Replaces `src/lib/emailService.ts`, which called EmailJS from the
 * browser. That could never have carried password resets: the reset link
 * is generated server-side from a token the browser must not see before
 * the user clicks it, and the request that triggers it is unauthenticated.
 * It was also configured with literal placeholder values, so nothing had
 * ever been delivered.
 *
 * Sending is over plain SMTP, so this is not tied to any vendor.
 */

let transport = null;

function getTransport() {
  if (transport) return transport;
  if (!emailConfigured) return null;

  transport = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    // Providers throttle hard on burst; a small pool keeps a batch of
    // invitations from opening one connection per message.
    pool: true,
    maxConnections: 3,
    maxMessages: 50,
  });

  return transport;
}

/**
 * Send one message.
 *
 * Never throws. Every caller is on a request path where a mail failure
 * must not fail the operation that triggered it — a pharmacy that
 * registered successfully should not see an error because an alert to an
 * administrator bounced. Failures go to stderr, where the platform's log
 * collector picks them up.
 *
 * Returns true when the message was handed to the provider.
 */
export async function sendMail({ to, subject, html, text, replyTo }) {
  if (!to) {
    console.error('[email] refusing to send with no recipient:', subject);
    return false;
  }

  const mail = {
    from: `"${env.emailFromName}" <${env.emailFrom}>`,
    to,
    subject,
    // A text part is not optional: HTML-only mail scores badly with spam
    // filters and is unreadable in text-only clients.
    text: text ?? stripHtml(html),
    html,
    ...(replyTo ? { replyTo } : {}),
  };

  const tx = getTransport();

  if (!tx) {
    // Development fallback. Printing the body is what makes the reset flow
    // testable without a mail provider — and is why this must never be the
    // path taken in production.
    console.info(
      `\n[email:console] To: ${to}\n[email:console] Subject: ${subject}\n` +
      `${mail.text.split('\n').map((l) => `[email:console] ${l}`).join('\n')}\n`,
    );
    return false;
  }

  try {
    const info = await tx.sendMail(mail);
    console.info(`[email] sent "${subject}" to ${to} (${info.messageId})`);
    return true;
  } catch (err) {
    // Loud, and includes the recipient: a silent delivery failure on a
    // password reset looks identical to a user mistyping their address.
    console.error(`[email] FAILED to send "${subject}" to ${to}:`, err.message);
    return false;
  }
}

/** Crude HTML → text for the plain-text alternative. */
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|h3|tr)>/gi, '\n')
    // Render links as "text (url)" so the destination survives in text.
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n').map((l) => l.trim()).join('\n')
    .trim();
}

/**
 * Verify the SMTP connection at boot.
 *
 * Catching a bad host or wrong credentials here means the problem shows up
 * in the deploy log, rather than the first time a user cannot reset their
 * password.
 */
export async function verifyMailer() {
  const tx = getTransport();
  if (!tx) return false;

  try {
    await tx.verify();
    console.info(`[email] SMTP ready (${env.smtp.host}:${env.smtp.port}, from ${env.emailFrom})`);
    return true;
  } catch (err) {
    console.error(`[email] SMTP verification FAILED (${env.smtp.host}:${env.smtp.port}):`, err.message);
    return false;
  }
}

export async function closeMailer() {
  if (transport) {
    transport.close();
    transport = null;
  }
}
