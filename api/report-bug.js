/**
 * Report Bug API (Vercel Version)
 *
 * Handles bug report submissions from workshop participants
 */

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

    // Log bug report to console (in production, you'd save to database/send email/etc)
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

    // TODO: In production, save to database or send notification
    // Examples:
    // - Save to Airtable/Google Sheets
    // - Send email notification
    // - Post to Slack/Discord webhook
    // - Create GitHub issue
    // - Save to database

    // For now, just acknowledge receipt
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
