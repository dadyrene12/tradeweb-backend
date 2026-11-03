const nodemailer = require('nodemailer');

const clean = (value) => String(value || '').trim();

const smtpHost = clean(process.env.SMTP_HOST);
const smtpUser = clean(process.env.SMTP_USER);
const smtpPass = clean(process.env.SMTP_PASS);
const resendApiKey = clean(process.env.RESEND_API_KEY);

const smtpConfigured = Boolean(smtpHost && smtpUser && smtpPass);
const resendConfigured = Boolean(resendApiKey);

const emailProvider = resendConfigured ? 'resend' : smtpConfigured ? 'smtp' : null;
const emailConfigured = Boolean(emailProvider);

let transporter = null;

if (smtpConfigured) {
  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });
}

const fromAddress = () =>
  clean(process.env.EMAIL_FROM) || 'Glectron <no-reply@glectron.com>';

const clientUrl = () =>
  (clean(process.env.CLIENT_URL).split(',')[0] || 'http://localhost:3000').replace(/\/$/, '');

const layout = (title, content) => `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#0A192F;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
            <tr>
              <td style="background:#1e73be;padding:28px 32px;">
                <div style="font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Glectron<span style="color:#00C853;">.</span></div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                ${content}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">
                This email was sent by Glectron. If you did not request it, you can safely ignore it.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

const button = (href, label) => `
  <a href="${href}" style="display:inline-block;background:#1e73be;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:10px;">
    ${label}
  </a>`;

const sendWithResend = async ({ to, subject, html, text }) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [to],
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Resend API responded with ${response.status}: ${detail || response.statusText}`);
  }

  return response.json();
};

const sendMail = async ({ to, subject, html, text }) => {
  if (!emailConfigured) {
    if (process.env.NODE_ENV !== 'production') {
      console.info('\n[email:dev] Email service is not configured. Preview:');
      console.info(`To: ${to}`);
      console.info(`Subject: ${subject}`);
      console.info(text);
      console.info('');
      return { preview: true };
    }

    throw new Error(
      'Email service is not configured. Set RESEND_API_KEY, or SMTP_HOST, SMTP_USER and SMTP_PASS.'
    );
  }

  if (emailProvider === 'resend') {
    return sendWithResend({ to, subject, html, text });
  }

  return transporter.sendMail({ from: fromAddress(), to, subject, html, text });
};

const verifyEmailTransport = async () => {
  if (!emailConfigured) {
    console.warn(
      '[email] No email provider configured. Set RESEND_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASS.'
    );
    return false;
  }

  if (emailProvider === 'resend') {
    console.info('[email] Using Resend API.');
    return true;
  }

  try {
    await transporter.verify();
    console.info(`[email] SMTP connection verified (${smtpHost}).`);
    return true;
  } catch (error) {
    console.error(`[email] SMTP connection failed (${smtpHost}): ${error.message}`);
    return false;
  }
};

const sendVerificationEmail = async (user, rawToken) => {
  const link = `${clientUrl()}/verify-email?token=${rawToken}&email=${encodeURIComponent(user.email)}`;
  const text = `Hi ${user.name},\n\nVerify your Glectron account by opening this link:\n${link}\n\nThis link expires in 24 hours.`;
  const html = layout(
    'Verify your email',
    `
      <h1 style="margin:0 0 12px;font-size:24px;color:#0A192F;">Verify your email</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#475569;">
        Hi ${user.name}, welcome to Glectron. Confirm your email address to activate your account.
      </p>
      <p style="margin:0 0 24px;">${button(link, 'Verify my email')}</p>
      <p style="margin:0 0 8px;font-size:13px;color:#64748b;">Or paste this link into your browser:</p>
      <p style="margin:0 0 24px;font-size:13px;word-break:break-all;color:#1e73be;">${link}</p>
      <p style="margin:0;font-size:13px;color:#64748b;">This link expires in 24 hours.</p>
    `
  );

  return sendMail({ to: user.email, subject: 'Verify your Glectron account', html, text });
};

const sendPasswordResetEmail = async (user, rawToken) => {
  const link = `${clientUrl()}/reset-password?token=${rawToken}&email=${encodeURIComponent(user.email)}`;
  const text = `Hi ${user.name},\n\nReset your Glectron password using this link:\n${link}\n\nThis link expires in 1 hour. If you did not request a reset, ignore this email.`;
  const html = layout(
    'Reset your password',
    `
      <h1 style="margin:0 0 12px;font-size:24px;color:#0A192F;">Reset your password</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#475569;">
        Hi ${user.name}, we received a request to reset your Glectron password.
      </p>
      <p style="margin:0 0 24px;">${button(link, 'Reset password')}</p>
      <p style="margin:0 0 8px;font-size:13px;color:#64748b;">Or paste this link into your browser:</p>
      <p style="margin:0 0 24px;font-size:13px;word-break:break-all;color:#1e73be;">${link}</p>
      <p style="margin:0;font-size:13px;color:#64748b;">This link expires in 1 hour. If you did not request it, no action is needed.</p>
    `
  );

  return sendMail({ to: user.email, subject: 'Reset your Glectron password', html, text });
};

module.exports = {
  sendMail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  verifyEmailTransport,
  smtpConfigured,
  resendConfigured,
  emailConfigured,
  emailProvider,
};
