require('dotenv').config();

const { sendMail, verifyEmailTransport, emailProvider } = require('../utils/email');

const run = async () => {
  const to = process.argv[2] || process.env.TEST_EMAIL;

  if (!to) {
    console.error('Usage: npm run test-email -- you@example.com');
    process.exitCode = 1;
    return;
  }

  const ready = await verifyEmailTransport();
  if (!ready) {
    console.error('Email is not configured or the SMTP connection failed. Check server/.env.');
    process.exitCode = 1;
    return;
  }

  console.log(`Sending test email via ${emailProvider} to ${to}...`);

  const result = await sendMail({
    to,
    subject: 'Glectron email test',
    text: 'If you can read this, email delivery from the Glectron server is working.',
    html: '<p>If you can read this, email delivery from the Glectron server is working.</p>',
  });

  console.log('Test email sent.', result);
};

run().catch((error) => {
  console.error('Test email failed:', error.message);
  process.exitCode = 1;
});
