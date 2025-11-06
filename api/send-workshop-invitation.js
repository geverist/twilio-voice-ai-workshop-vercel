/**
 * Send Workshop Invitation Email (Vercel API)
 *
 * This function sends personalized workshop invitation emails to students using SendGrid.
 * It's designed for workshop instructors to easily invite multiple students.
 *
 * Required Environment Variables:
 * - SENDGRID_API_KEY: Your SendGrid API key
 * - WORKSHOP_URL: Your deployed workshop URL (e.g., https://your-vercel-app.vercel.app)
 * - INSTRUCTOR_EMAIL: Email address invitations should come from
 * - INSTRUCTOR_NAME: Name of the instructor (optional)
 * - GITHUB_REPO_URL: Workshop repository URL
 */

import sgMail from '@sendgrid/mail';
import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.'
    });
  }

  try {
    // Validate SendGrid API key is configured
    if (!process.env.SENDGRID_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'SendGrid API key not configured. Please set SENDGRID_API_KEY in your environment variables.'
      });
    }

    // Initialize SendGrid
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    // Get request parameters (support both JSON and form-encoded)
    let studentEmail, studentName, workshopDate, additionalNotes;

    if (req.headers['content-type']?.includes('application/json')) {
      ({ studentEmail, studentName, workshopDate, additionalNotes } = req.body);
    } else {
      // Form-encoded (from original dashboard)
      ({ studentEmail, studentName, workshopDate, additionalNotes } = req.body);
    }

    // Validate required parameters
    if (!studentEmail) {
      return res.status(400).json({
        success: false,
        error: 'Student email is required'
      });
    }

    // Get configuration from environment variables with defaults
    const workshopUrl = process.env.WORKSHOP_URL || process.env.VERCEL_URL || 'https://your-workshop-url.vercel.app';
    const instructorEmail = process.env.INSTRUCTOR_EMAIL || 'workshop@example.com';
    const instructorName = process.env.INSTRUCTOR_NAME || 'Workshop Instructor';
    const githubRepo = process.env.GITHUB_REPO_URL || 'https://github.com/geverist/twilio-voice-ai-workshop-vercel';

    // Build email content
    const emailSubject = 'Welcome to the Twilio Voice AI Workshop!';

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, #F22F46 0%, #0d122b 100%);
      color: white;
      padding: 40px 30px;
      border-radius: 8px 8px 0 0;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
    }
    .content {
      background: #f8f9fa;
      padding: 30px;
      border-radius: 0 0 8px 8px;
    }
    .button {
      display: inline-block;
      background: #F22F46;
      color: white;
      padding: 15px 30px;
      text-decoration: none;
      border-radius: 8px;
      font-weight: bold;
      margin: 20px 0;
    }
    .info-box {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
      border-left: 4px solid #F22F46;
    }
    .checklist {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .checklist li {
      margin: 10px 0;
    }
    .footer {
      text-align: center;
      padding: 20px;
      color: #666;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎙️ Twilio Voice AI Workshop</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.95;">Build AI-Powered Voice Agents in 2-3 Hours</p>
  </div>

  <div class="content">
    <p>Hi ${studentName || 'there'}!</p>

    <p>Welcome to the <strong>Twilio Voice AI Workshop</strong>! You've been invited to learn how to build intelligent voice agents using Twilio ConversationRelay, OpenAI, and modern voice AI technologies.</p>

    ${workshopDate ? `<div class="info-box">
      <strong>📅 Workshop Date:</strong> ${workshopDate}
    </div>` : ''}

    <h2>🚀 Get Started Now</h2>
    <p>Click the button below to access the workshop with your information pre-filled:</p>

    <center>
      <a href="${workshopUrl}/?email=${encodeURIComponent(studentEmail)}${studentName ? `&name=${encodeURIComponent(studentName)}` : ''}" class="button">Start Workshop →</a>
    </center>

    <h2>📋 Before the Workshop</h2>
    <div class="checklist">
      <p>Please complete these steps before the workshop begins:</p>
      <ul>
        <li>✅ <strong>Create a Twilio Account:</strong> <a href="https://www.twilio.com/try-twilio">Sign up here</a> (free trial includes $15 credit)</li>
        <li>✅ <strong>Install Node.js:</strong> <a href="https://nodejs.org/">Download here</a> (v18 or higher)</li>
        <li>✅ <strong>Install Twilio CLI:</strong> Run <code>npm install -g twilio-cli</code></li>
        <li>✅ <strong>Create GitHub Account:</strong> Required for repository access</li>
        <li>✅ <strong>Optional: OpenAI API Key:</strong> <a href="https://platform.openai.com/api-keys">Get one here</a> for AI features</li>
      </ul>
    </div>

    <h2>📚 Repository Access</h2>
    <div class="info-box">
      <p><strong>Workshop Repository:</strong> <a href="${githubRepo}">${githubRepo}</a></p>
      <p>You'll receive a separate GitHub invitation email to access the private repository. Please accept it before the workshop.</p>
      <p><strong>Your GitHub username:</strong> If you haven't provided it yet, please reply to this email with your GitHub username so we can grant you access.</p>
    </div>

    ${additionalNotes ? `<h2>📝 Additional Notes</h2>
    <div class="info-box">
      ${additionalNotes.replace(/\n/g, '<br>')}
    </div>` : ''}

    <h2>🎯 What You'll Learn</h2>
    <ul>
      <li>Build AI voice agents with Twilio ConversationRelay</li>
      <li>Integrate OpenAI GPT-4 for intelligent conversations</li>
      <li>Handle real-time WebSocket connections</li>
      <li>Implement tool calling for actions (SMS, scheduling, etc.)</li>
      <li>Deploy production-ready voice applications</li>
    </ul>

    <h2>💬 Questions?</h2>
    <p>If you have any questions before the workshop, feel free to reply to this email.</p>

    <p>Looking forward to seeing you at the workshop!</p>

    <p><strong>${instructorName}</strong><br>
    <a href="mailto:${instructorEmail}">${instructorEmail}</a></p>
  </div>

  <div class="footer">
    <p>This invitation was sent from the Twilio Voice AI Workshop</p>
    <p>Built with ❤️ using Twilio, OpenAI, and SendGrid</p>
  </div>
</body>
</html>
    `;

    // Plain text version (fallback for email clients that don't support HTML)
    const emailText = `
Hi ${studentName || 'there'}!

Welcome to the Twilio Voice AI Workshop! You've been invited to learn how to build intelligent voice agents using Twilio ConversationRelay, OpenAI, and modern voice AI technologies.

${workshopDate ? `Workshop Date: ${workshopDate}\n` : ''}

GET STARTED:
Access the workshop: ${workshopUrl}/?email=${encodeURIComponent(studentEmail)}${studentName ? `&name=${encodeURIComponent(studentName)}` : ''}

BEFORE THE WORKSHOP:
1. Create a Twilio Account: https://www.twilio.com/try-twilio (free trial includes $15 credit)
2. Install Node.js: https://nodejs.org/ (v18 or higher)
3. Install Twilio CLI: npm install -g twilio-cli
4. Create GitHub Account (required for repository access)
5. Optional: Get OpenAI API Key at https://platform.openai.com/api-keys

REPOSITORY ACCESS:
Workshop Repository: ${githubRepo}
You'll receive a separate GitHub invitation email. Please accept it before the workshop.
If you haven't provided your GitHub username yet, please reply to this email with it.

${additionalNotes ? `ADDITIONAL NOTES:\n${additionalNotes}\n` : ''}

WHAT YOU'LL LEARN:
- Build AI voice agents with Twilio ConversationRelay
- Integrate OpenAI GPT-4 for intelligent conversations
- Handle real-time WebSocket connections
- Implement tool calling for actions (SMS, scheduling, etc.)
- Deploy production-ready voice applications

Questions? Reply to this email.

Looking forward to seeing you at the workshop!

${instructorName}
${instructorEmail}
    `;

    // Send email via SendGrid
    const msg = {
      to: studentEmail,
      from: {
        email: instructorEmail,
        name: instructorName
      },
      subject: emailSubject,
      text: emailText,
      html: emailHtml,
      trackingSettings: {
        clickTracking: {
          enable: true
        },
        openTracking: {
          enable: true
        }
      }
    };

    // Send the email
    await sgMail.send(msg);

    // Log invitation to database if available
    try {
      if (process.env.POSTGRES_URL) {
        await sql`
          INSERT INTO workshop_invitations
          (student_email, student_name, workshop_date, additional_notes, sent_at)
          VALUES (${studentEmail}, ${studentName || 'Not provided'}, ${workshopDate || null}, ${additionalNotes || null}, NOW())
        `;
      }
    } catch (dbError) {
      console.error('Error logging invitation to database:', dbError);
      // Don't fail the request if database logging fails
    }

    // Return success response
    return res.status(200).json({
      success: true,
      message: `Workshop invitation sent successfully to ${studentEmail}`,
      studentEmail,
      studentName: studentName || 'Not provided'
    });

  } catch (error) {
    console.error('Error sending workshop invitation:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to send invitation',
      details: error.message
    });
  }
}
