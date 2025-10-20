/**
 * Report Bug API (Vercel Version)
 *
 * Handles bug report submissions from workshop participants
 *
 * Required Environment Variables:
 * - SENDGRID_API_KEY: Your SendGrid API key
 * - INSTRUCTOR_EMAIL: Email to receive bug reports
 * - INSTRUCTOR_NAME: Name of instructor (optional)
 */

import sgMail from '@sendgrid/mail';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const {
      description,
      step,
      errorMessage,
      expectedBehavior,
      actualBehavior,
      userName,
      browserInfo,
      timestamp,
      pageUrl,
      callDirection,
      deploymentStatus
    } = req.body;

    // Validate required fields
    if (!description) {
      return res.status(400).json({
        success: false,
        error: 'Bug description is required'
      });
    }

    // Log bug report to console
    console.log('==================== WORKSHOP BUG REPORT ====================');
    console.log('Timestamp:', timestamp);
    console.log('User:', userName || 'Anonymous');
    console.log('Step:', step);
    console.log('Page URL:', pageUrl);
    console.log('Call Direction:', callDirection);
    console.log('\n--- DESCRIPTION ---');
    console.log(description);
    if (errorMessage) {
      console.log('\n--- ERROR MESSAGE ---');
      console.log(errorMessage);
    }
    if (expectedBehavior) {
      console.log('\n--- EXPECTED BEHAVIOR ---');
      console.log(expectedBehavior);
    }
    if (actualBehavior) {
      console.log('\n--- ACTUAL BEHAVIOR ---');
      console.log(actualBehavior);
    }
    console.log('\n--- DEPLOYMENT STATUS ---');
    console.log(JSON.stringify(deploymentStatus, null, 2));
    console.log('\n--- BROWSER INFO ---');
    console.log(browserInfo);
    console.log('==========================================================\n');

    // Send email notification via SendGrid (if configured)
    if (process.env.SENDGRID_API_KEY && process.env.INSTRUCTOR_EMAIL) {
      try {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);

        const instructorEmail = process.env.INSTRUCTOR_EMAIL;
        const instructorName = process.env.INSTRUCTOR_NAME || 'Workshop Instructor';

        // Build email content
        const emailSubject = `🐛 Workshop Bug Report - ${step}`;

        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 700px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
      color: white;
      padding: 30px;
      border-radius: 8px 8px 0 0;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
    }
    .content {
      background: #f8f9fa;
      padding: 30px;
      border-radius: 0 0 8px 8px;
    }
    .info-box {
      background: white;
      padding: 15px;
      border-radius: 6px;
      margin: 15px 0;
      border-left: 4px solid #dc3545;
    }
    .info-box h3 {
      margin: 0 0 10px 0;
      color: #dc3545;
      font-size: 16px;
    }
    .info-box p {
      margin: 5px 0;
    }
    .code {
      background: #2d2d2d;
      color: #f8f8f2;
      padding: 15px;
      border-radius: 6px;
      overflow-x: auto;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .meta {
      background: #e9ecef;
      padding: 10px 15px;
      border-radius: 6px;
      margin: 10px 0;
      font-size: 13px;
    }
    .meta strong {
      color: #495057;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🐛 Workshop Bug Report</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.95;">Submitted by ${userName || 'Anonymous Student'}</p>
  </div>

  <div class="content">
    <div class="meta">
      <strong>⏰ Timestamp:</strong> ${new Date(timestamp).toLocaleString()}<br>
      <strong>📍 Step:</strong> ${step}<br>
      <strong>🔗 Page URL:</strong> <a href="${pageUrl}">${pageUrl}</a><br>
      <strong>📞 Call Direction:</strong> ${callDirection}
    </div>

    <div class="info-box">
      <h3>📝 Issue Description</h3>
      <p>${description.replace(/\n/g, '<br>')}</p>
    </div>

    ${errorMessage ? `<div class="info-box">
      <h3>❌ Error Message</h3>
      <div class="code">${errorMessage}</div>
    </div>` : ''}

    ${expectedBehavior ? `<div class="info-box">
      <h3>✅ Expected Behavior</h3>
      <p>${expectedBehavior.replace(/\n/g, '<br>')}</p>
    </div>` : ''}

    ${actualBehavior ? `<div class="info-box">
      <h3>⚠️ Actual Behavior</h3>
      <p>${actualBehavior.replace(/\n/g, '<br>')}</p>
    </div>` : ''}

    <div class="info-box">
      <h3>🔧 Deployment Status</h3>
      <div class="code">${JSON.stringify(deploymentStatus, null, 2)}</div>
    </div>

    <div class="info-box">
      <h3>🌐 Browser Info</h3>
      <div class="code">${browserInfo}</div>
    </div>

    <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; color: #6c757d; font-size: 13px;">
      This bug report was submitted from the Twilio Voice AI Workshop
    </p>
  </div>
</body>
</html>
        `;

        const emailText = `
🐛 WORKSHOP BUG REPORT

Submitted by: ${userName || 'Anonymous Student'}
Timestamp: ${new Date(timestamp).toLocaleString()}
Step: ${step}
Page URL: ${pageUrl}
Call Direction: ${callDirection}

DESCRIPTION:
${description}

${errorMessage ? `ERROR MESSAGE:\n${errorMessage}\n` : ''}
${expectedBehavior ? `EXPECTED BEHAVIOR:\n${expectedBehavior}\n` : ''}
${actualBehavior ? `ACTUAL BEHAVIOR:\n${actualBehavior}\n` : ''}

DEPLOYMENT STATUS:
${JSON.stringify(deploymentStatus, null, 2)}

BROWSER INFO:
${browserInfo}

---
This bug report was submitted from the Twilio Voice AI Workshop
        `;

        const msg = {
          to: instructorEmail,
          from: {
            email: instructorEmail,
            name: 'Workshop Bug Reporter'
          },
          replyTo: userName ? undefined : instructorEmail, // If user provided name, they might have email
          subject: emailSubject,
          text: emailText,
          html: emailHtml
        };

        await sgMail.send(msg);
        console.log(`✅ Bug report email sent to ${instructorEmail}`);
      } catch (emailError) {
        console.error('Failed to send bug report email:', emailError);
        // Don't fail the request if email fails - still log to console
      }
    } else {
      console.log('ℹ️ SendGrid not configured - bug report logged to console only');
    }

    // Acknowledge receipt
    return res.status(200).json({
      success: true,
      message: 'Thank you for reporting this issue! We\'ll look into it.'
    });

  } catch (error) {
    console.error('Bug report submission error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to submit bug report'
    });
  }
}
