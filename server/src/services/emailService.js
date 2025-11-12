import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const BASE_URL = process.env.FRONTEND_BASE_URL || 'http://localhost:5173';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

const loadTemplate = (filename) =>
  fs.readFileSync(path.join(__dirname, '..', 'templates', filename), 'utf-8');

// Send activation email
export const sendActivationEmail = async (to, token, name = '', type = 'activation') => {
  const traceId = `EMAIL-ACTIVATE-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
  try {
    const subject = type === 'reactivation' ? 'Activate Your IRC Account Again' : 'Activate Your IRC Account';
    const templateFile = type === 'reactivation' ? 'reactivation.html' : 'activation.html';
    const html = loadTemplate(templateFile)
      .replace('{{name}}', name || 'User')
      .replace('{{activationLink}}', `${BASE_URL}/activate?token=${encodeURIComponent(token)}`);

    await transporter.sendMail({
      from: `"IRC Admin" <${process.env.MAIL_USER}>`,
      to,
      subject,
      html
    });
  } catch (err) {
    console.error(`[${traceId}] Failed to send activation email:`, err);
    throw new Error('Failed to send activation email');
  }
};

// Send OTP code
export const sendOtpEmail = async (to, otp, name = '') => {
  const traceId = `EMAIL-OTP-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
  try {
    const subject = 'Your IRC OTP Code';
    const html = loadTemplate('otp.html')
      .replace('{{name}}', name || 'User')
      .replace('{{otp}}', otp);

    await transporter.sendMail({
      from: `"IRC Admin" <${process.env.MAIL_USER}>`,
      to,
      subject,
      html
    });
  } catch (err) {
    console.error(`[${traceId}] Failed to send OTP email:`, err);
    throw new Error('Failed to send OTP email');
  }
};

// Send reset password link
export const sendResetPasswordEmail = async (to, token, name = '') => {
  const traceId = `EMAIL-RESET-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
  try {
    const subject = 'IRC Password Reset';
    const html = loadTemplate('reset-password.html')
      .replace('{{name}}', name || 'User')
      .replace('{{resetLink}}', `${BASE_URL}/resetpassword?token=${encodeURIComponent(token)}`);

    await transporter.sendMail({
      from: `"IRC Admin" <${process.env.MAIL_USER}>`,
      to,
      subject,
      html
    });
  } catch (err) {
    console.error(`[${traceId}] Failed to send reset password email:`, err);
    throw new Error('Failed to send reset password email');
  }
};


export const sendEventRegistrationEmail = async (to, name, eventInfo = {}) => {
  const traceId = `EMAIL-REG-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
  try {
    const subject = `Registration Confirmed: ${eventInfo.name}`;

    const html = loadTemplate('event-registration.html')
      .replace('{{name}}', name || 'User')
      .replace('{{eventName}}', eventInfo.name || 'Unnamed Event')
      .replace('{{eventDate}}', eventInfo.date || 'N/A')
      .replace('{{eventTime}}', eventInfo.time || 'N/A')  // ✅ Add this line
      .replace('{{eventLocation}}', eventInfo.location || 'N/A')
      .replace('{{eventType}}', eventInfo.type || 'N/A')
      .replace('{{pax}}', eventInfo.pax || '1');

    await transporter.sendMail({
      from: `"IRC Admin" <${process.env.MAIL_USER}>`,
      to,
      subject,
      html
    });
  } catch (err) {
    console.error(`[${traceId}] Failed to send event registration email:`, err);
    throw new Error('Failed to send event registration email');
  }
};


// Send external review invitation email
export const sendExternalReviewInvite = async (to, name, link, paperInfo = {}, eventInfo = {}) => {
  const traceId = `EMAIL-EXT-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
  try {
    const subject = `External Review Invitation: ${paperInfo.title || 'Paper Submission'}`;

    // Load template (create it in templates/external-review-invite.html)
    const html = loadTemplate('external-review-invite.html')
      .replace('{{name}}', name || 'Reviewer')
      .replace('{{paperTitle}}', paperInfo.title || 'Untitled Paper')
      .replace('{{eventName}}', eventInfo.name || 'Unnamed Event')
      .replace('{{eventStart}}', eventInfo.start_date || 'N/A')
      .replace('{{eventEnd}}', eventInfo.end_date || 'N/A')
      .replace('{{reviewLink}}', link);

    await transporter.sendMail({
      from: `"IRC Conference Committee" <${process.env.MAIL_USER}>`,
      to,
      subject,
      html,
    });

    console.log(`[${traceId}] External review invitation email sent to ${to}`);
  } catch (err) {
    console.error(`[${traceId}] Failed to send external review invitation:`, err);
    throw new Error('Failed to send external review invitation');
  }
};

// Helper function to escape HTML
function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

// Build reviews section HTML (only comments, no scores or names)
function buildReviewsSection(reviews) {
  if (!reviews || reviews.length === 0) {
    return '<div class="no-reviews">No reviews have been submitted yet for this paper.</div>';
  }

  // Filter reviews that have comments for author
  const reviewsWithComments = reviews.filter(r => r.comments_for_author && r.comments_for_author.trim());
  
  if (reviewsWithComments.length === 0) {
    return '<div class="no-reviews">No reviewer comments available for this paper.</div>';
  }

  let reviewsHtml = '<h2 style="margin-top: 30px; font-size: 20px; color: #111827;">Reviewer Comments</h2>';

  reviewsWithComments.forEach((review) => {
    reviewsHtml += `
      <div class="review-section">
        <div class="comments">
          <div class="comments-text">${escapeHtml(review.comments_for_author)}</div>
        </div>
      </div>`;
  });

  return reviewsHtml;
}

// Build reminder section for approved submissions
function buildReminderSection(status) {
  if (status === 'approved') {
    return `
      <div class="reminder-box">
        <h3>📝 Next Steps</h3>
        <p><strong>Your submission has been approved!</strong></p>
        <p>Please review the comments above and make any necessary changes to your paper.</p>
        <p>Once you have made the required revisions, please submit your final copy through the submission portal.</p>
      </div>`;
  }
  return '';
}

// Send submission status notification email
export const sendSubmissionStatusEmail = async (to, authorName, status, paperInfo = {}, eventInfo = {}, reviews = []) => {
  const traceId = `EMAIL-STATUS-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
  try {
    const statusText = status === 'approved' ? 'Approved' : 'Rejected';
    const statusClass = status === 'approved' ? 'status-approved' : 'status-rejected';
    const subject = `Submission ${statusText}: ${paperInfo.title || 'Your Paper'}`;

    const reviewsSection = buildReviewsSection(reviews);
    const reminderSection = buildReminderSection(status);

    const html = loadTemplate('submission-status-notification.html')
      .replace('{{authorName}}', escapeHtml(authorName || 'Author'))
      .replace('{{paperTitle}}', escapeHtml(paperInfo.title || 'Untitled Paper'))
      .replace('{{eventName}}', escapeHtml(eventInfo.name || 'Unnamed Event'))
      .replace('{{statusText}}', statusText)
      .replace('{{statusClass}}', statusClass)
      .replace('{{reviewsSection}}', reviewsSection)
      .replace('{{reminderSection}}', reminderSection);

    await transporter.sendMail({
      from: `"IRC Conference Committee" <${process.env.MAIL_USER}>`,
      to,
      subject,
      html,
    });

    console.log(`[${traceId}] Submission status email sent to ${to}`);
  } catch (err) {
    console.error(`[${traceId}] Failed to send submission status email:`, err);
    throw new Error('Failed to send submission status email');
  }
};