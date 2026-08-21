import { env } from '../env.js';
import { sendMail } from './mailer.js';
import { queryAll } from '../db.js';

/**
 * Email content.
 *
 * Kept apart from the transport so the wording can be edited without
 * touching delivery, and so each message is one readable function rather
 * than a string assembled at the call site.
 *
 * Styling is inline: Gmail and Outlook strip <style> blocks, so a
 * stylesheet would render as unstyled text for most recipients.
 */

const BRAND = '#0f766e';
const INK = '#1f2937';
const MUTED = '#6b7280';

/**
 * Escape interpolated values.
 *
 * Names, pharmacy names and reasons are user-supplied and end up inside
 * HTML. Without this, a pharmacy called `<script>…` would be injected into
 * an administrator's inbox — and some mail clients still execute enough to
 * make that matter.
 */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Flatten a user-supplied value for use in a Subject line.
 *
 * nodemailer already refuses to turn an embedded CRLF into a real header —
 * it folds it into a continuation line instead, and the envelope is
 * unaffected. But a folded subject still *reads* as though the message
 * carries extra headers, which is exactly what an attacker sending a
 * pharmacy name of "Evil\r\nBcc: ..." is hoping a human will believe.
 * Collapsing the whitespace removes the illusion.
 */
function subjectSafe(value, max = 120) {
  const flat = String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function layout({ heading, body, cta }) {
  return `
<div style="margin:0;padding:24px 0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <tr>
      <td style="padding:20px 28px;background:${BRAND};">
        <span style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:-0.2px;">PharmConnect Zim</span>
      </td>
    </tr>
    <tr>
      <td style="padding:28px;">
        <h1 style="margin:0 0 14px;font-size:19px;line-height:1.35;color:${INK};font-weight:650;">${heading}</h1>
        <div style="font-size:14.5px;line-height:1.65;color:${INK};">${body}</div>
        ${cta ? `
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
          <tr><td style="border-radius:8px;background:${BRAND};">
            <a href="${cta.url}" style="display:inline-block;padding:11px 22px;font-size:14.5px;font-weight:600;color:#ffffff;text-decoration:none;">${cta.label}</a>
          </td></tr>
        </table>
        <p style="margin:12px 0 0;font-size:12.5px;line-height:1.6;color:${MUTED};">
          If the button does not work, copy this link into your browser:<br>
          <span style="word-break:break-all;color:${MUTED};">${cta.url}</span>
        </p>` : ''}
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px 22px;border-top:1px solid #e5e7eb;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED};">
          PharmConnect Zim — finding medication across Zimbabwe.<br>
          This is an automated message; replies to it are not monitored.
        </p>
      </td>
    </tr>
  </table>
</div>`.trim();
}

// ------------------------------------------------------------------
// Account
// ------------------------------------------------------------------

/**
 * Password reset link.
 *
 * The only email the application genuinely cannot work without: there is
 * no other way for someone locked out to get back in.
 */
export function sendPasswordReset({ to, token, expiresInMinutes = 60 }) {
  const url = `${env.appUrl}/reset-password?token=${encodeURIComponent(token)}`;

  return sendMail({
    to,
    subject: 'Reset your PharmConnect password',
    html: layout({
      heading: 'Reset your password',
      body: `
        <p style="margin:0 0 12px;">
          Someone asked to reset the password for this address. Click below to choose a new one.
        </p>
        <p style="margin:0;">
          This link expires in <strong>${expiresInMinutes} minutes</strong> and can only be used once.
        </p>
        <p style="margin:14px 0 0;color:${MUTED};font-size:13px;">
          If you did not request this, you can ignore this email — your password will not change.
        </p>`,
      cta: { url, label: 'Choose a new password' },
    }),
  });
}

/**
 * Confirmation that a password actually changed.
 *
 * Sent after the fact, so that a reset the account holder did not perform
 * is visible to them rather than silent. This is often the only signal a
 * compromised account gets.
 */
export function sendPasswordChanged({ to, when = new Date() }) {
  return sendMail({
    to,
    subject: 'Your PharmConnect password was changed',
    html: layout({
      heading: 'Your password was changed',
      body: `
        <p style="margin:0 0 12px;">
          The password for this account was changed on
          <strong>${esc(when.toUTCString())}</strong>.
        </p>
        <p style="margin:0 0 12px;">
          All other signed-in devices were signed out.
        </p>
        <p style="margin:0;color:#b91c1c;">
          <strong>If this was not you</strong>, reset your password immediately and contact your
          administrator — someone else may have access to this account.
        </p>`,
      cta: { url: `${env.appUrl}/login`, label: 'Sign in' },
    }),
  });
}

// ------------------------------------------------------------------
// Team
// ------------------------------------------------------------------

/** Invitation to join a pharmacy. Consumed by the signup flow. */
export function sendInvitation({ to, pharmacyName, role, invitedBy }) {
  const url = `${env.appUrl}/register?invite=${encodeURIComponent(to)}`;
  const roleLabel = role === 'pharmacy_admin' ? 'an administrator' : 'a staff member';

  return sendMail({
    to,
    subject: `You have been invited to join ${subjectSafe(pharmacyName)} on PharmConnect`,
    html: layout({
      heading: `Join ${esc(pharmacyName)} on PharmConnect`,
      body: `
        <p style="margin:0 0 12px;">
          ${esc(invitedBy || 'An administrator')} has invited you to join
          <strong>${esc(pharmacyName)}</strong> as ${roleLabel}.
        </p>
        <p style="margin:0;">
          Create your account with <strong>this email address</strong> and you will be added to
          the team automatically. The invitation expires in 14 days.
        </p>`,
      cta: { url, label: 'Create your account' },
    }),
  });
}

/** Credentials handover when an admin provisions an account directly. */
export function sendAccountCreated({ to, fullName, pharmacyName, createdBy }) {
  return sendMail({
    to,
    subject: 'Your PharmConnect account is ready',
    html: layout({
      heading: 'Your account is ready',
      body: `
        <p style="margin:0 0 12px;">Hello ${esc(fullName)},</p>
        <p style="margin:0 0 12px;">
          ${esc(createdBy || 'An administrator')} has created a PharmConnect account for you
          ${pharmacyName ? `at <strong>${esc(pharmacyName)}</strong>` : ''}.
          Sign in with this email address and the password you were given.
        </p>
        <p style="margin:0;color:${MUTED};font-size:13px;">
          The password is deliberately not included in this email — email is not a safe place to
          put one. Change it after your first sign-in, and turn on two-factor authentication from
          the security page.
        </p>`,
      cta: { url: `${env.appUrl}/login`, label: 'Sign in' },
    }),
  });
}

// ------------------------------------------------------------------
// Administrative alerts
// ------------------------------------------------------------------

/**
 * Tell the platform's administrators that a pharmacy is awaiting approval.
 *
 * Goes to ADMIN_ALERT_EMAIL when set, otherwise to every active super
 * admin — looked up at send time, so adding an administrator does not
 * require a config change to start alerting them.
 */
export async function sendNewPharmacyAlert({ pharmacyName, pharmacyEmail, city }) {
  const recipients = await adminRecipients();
  if (recipients.length === 0) {
    console.warn('[email] no super admin to notify about new pharmacy:', pharmacyName);
    return false;
  }

  return sendMail({
    to: recipients.join(', '),
    replyTo: pharmacyEmail,
    subject: `New pharmacy awaiting approval: ${subjectSafe(pharmacyName)}`,
    html: layout({
      heading: 'A new pharmacy has registered',
      body: `
        <p style="margin:0 0 12px;">
          <strong>${esc(pharmacyName)}</strong>${city ? ` in ${esc(city)}` : ''} has registered
          and is waiting for verification.
        </p>
        <p style="margin:0;">Contact: ${esc(pharmacyEmail)}</p>`,
      cta: { url: `${env.appUrl}/admin/approvals`, label: 'Review the application' },
    }),
  });
}

/** Tell a pharmacy their approval status changed. */
export function sendPharmacyStatusChanged({ to, pharmacyName, status }) {
  const approved = status === 'APPROVED';
  const message = approved
    ? 'Your pharmacy is now listed and patients can find your stock in search results.'
    : status === 'REJECTED'
      ? 'Your application was not approved. Contact us if you believe this is a mistake.'
      : `Your pharmacy is now <strong>${esc(status)}</strong> and will not appear in search results.`;

  return sendMail({
    to,
    subject: `${subjectSafe(pharmacyName)}: your pharmacy is now ${status}`,
    html: layout({
      heading: approved ? 'Your pharmacy has been approved' : `Status updated: ${esc(status)}`,
      body: `<p style="margin:0;">${message}</p>`,
      cta: approved ? { url: `${env.appUrl}/dashboard`, label: 'Open your dashboard' } : null,
    }),
  });
}

async function adminRecipients() {
  if (env.adminAlertEmail) {
    return env.adminAlertEmail.split(',').map((a) => a.trim()).filter(Boolean);
  }
  try {
    const rows = await queryAll(
      `SELECT email FROM profiles
        WHERE global_role = 'super_admin' AND lifecycle_status = 'ACTIVE'`,
    );
    return rows.map((r) => r.email);
  } catch (err) {
    console.error('[email] could not resolve admin recipients:', err.message);
    return [];
  }
}
