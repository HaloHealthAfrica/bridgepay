/**
 * Email Notification Service
 * Handles sending emails via Resend
 */

import { createRequire } from 'node:module';

// `resend` is CommonJS; load via require for ESM SSR compatibility.
const require = createRequire(import.meta.url);
const { Resend } = require('resend');

// Initialize Resend client
let resendClient = null;

function getResendClient() {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn('[Email] RESEND_API_KEY not set, email sending disabled');
      return null;
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

/**
 * Send an email
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} [options.text] - Plain text content (optional)
 * @param {string} [options.from] - Sender email (defaults to env var)
 * @param {Array} [options.replyTo] - Reply-to addresses
 * @returns {Promise<Object>} Resend response
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
  from,
  replyTo,
}) {
  const client = getResendClient();
  if (!client) {
    console.warn('[Email] Email client not available, skipping send');
    return { ok: false, error: 'Email service not configured' };
  }

  try {
    const fromEmail = from || process.env.RESEND_FROM_EMAIL || 'Bridge <noreply@bridge.example.com>';
    
    const result = await client.emails.send({
      from: fromEmail,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML for text version
      replyTo: replyTo ? (Array.isArray(replyTo) ? replyTo : [replyTo]) : undefined,
    });

    if (result.error) {
      console.error('[Email] Send failed:', result.error);
      return { ok: false, error: result.error };
    }

    console.log('[Email] Sent successfully:', result.data?.id);
    return { ok: true, id: result.data?.id };
  } catch (error) {
    console.error('[Email] Send error:', error);
    return { ok: false, error: error.message };
  }
}

/**
 * Send email with template
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.template - Template name
 * @param {Object} options.data - Template data
 * @returns {Promise<Object>} Send result
 */
export async function sendEmailTemplate({ to, template, data = {} }) {
  const { renderEmailTemplate } = await import('./templates.js');
  
  const rendered = await renderEmailTemplate(template, data);
  if (!rendered) {
    return { ok: false, error: `Template "${template}" not found` };
  }

  return sendEmail({
    to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}

/**
 * Check if email service is configured
 */
export function isEmailConfigured() {
  return !!process.env.RESEND_API_KEY;
}


