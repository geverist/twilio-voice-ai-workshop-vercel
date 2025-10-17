/**
 * Submit Feedback API (Vercel Version)
 *
 * Handles feedback submissions from workshop participants
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
      name,
      message,
      rating,
      completedSteps,
      timestamp,
      context
    } = req.body;

    // Validate required fields
    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Feedback message is required'
      });
    }

    // Log feedback to console (in production, you'd save to database/send email/etc)
    console.log('==================== WORKSHOP FEEDBACK ====================');
    console.log('Timestamp:', timestamp);
    console.log('Name:', name || 'Anonymous');
    console.log('Rating:', rating ? `${rating}/5 stars` : 'Not provided');
    console.log('Completed Steps:', completedSteps);
    console.log('Message:', message);
    console.log('Context:', JSON.stringify(context, null, 2));
    console.log('==========================================================');

    // TODO: In production, save to database or send notification
    // Examples:
    // - Save to Airtable/Google Sheets
    // - Send email notification
    // - Post to Slack/Discord webhook
    // - Save to database

    // For now, just acknowledge receipt
    return res.status(200).json({
      success: true,
      message: 'Thank you for your feedback! We really appreciate it.'
    });

  } catch (error) {
    console.error('Feedback submission error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to submit feedback'
    });
  }
}
