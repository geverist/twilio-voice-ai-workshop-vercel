/**
 * Twilio Configure Webhook API
 *
 * Automatically configures the selected Twilio phone number's webhook URL
 * to point to the voice-handler with the sessionToken parameter
 *
 * POST /api/twilio-configure-webhook
 * Body: {
 *   sessionToken: string (required)
 * }
 */

import twilio from 'twilio';
import postgres from 'postgres';
import { applyCORS, handlePreflightRequest } from './_lib/cors.js';
import { applyRateLimit } from './_lib/ratelimit.js';
import {
  validateRequired,
  validateString,
  handleValidationError
} from './_lib/validation.js';

const sql = postgres(process.env.POSTGRES_URL, {
  ssl: 'require',
  max: 1
});

export default async function handler(req, res) {
  applyCORS(req, res);

  if (handlePreflightRequest(req, res)) {
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const allowed = await applyRateLimit(req, res);
  if (!allowed) {
    return;
  }

  try {
    const { sessionToken } = req.body;

    // Validation
    try {
      validateRequired({ sessionToken }, ['sessionToken']);
      validateString(sessionToken, 'sessionToken', { minLength: 10, maxLength: 200 });
    } catch (validationError) {
      return handleValidationError(validationError, res);
    }

    console.log(`🔧 Configuring webhook for session: ${sessionToken.substring(0, 20)}...`);

    // Get student config to find phone number and Twilio credentials
    const configs = await sql`
      SELECT
        selected_phone_number,
        twilio_account_sid,
        twilio_auth_token
      FROM student_configs
      WHERE session_token = ${sessionToken}
      LIMIT 1
    `;

    if (configs.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Configuration not found'
      });
    }

    const config = configs[0];
    const phoneNumber = config.selected_phone_number;
    const accountSid = config.twilio_account_sid;
    const authToken = config.twilio_auth_token;

    // Check if Twilio credentials are configured
    if (!accountSid || !authToken) {
      return res.status(400).json({
        success: false,
        error: 'Twilio credentials not found. Please connect your Twilio account in Settings first.'
      });
    }

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'No phone number selected. Please select a phone number in Settings first.'
      });
    }

    console.log(`  → Using Twilio Account: ${accountSid}`);
    console.log(`  → Configuring phone: ${phoneNumber}`);

    // Initialize Twilio client
    const client = twilio(accountSid, authToken);

    // Find the phone number SID
    console.log('  → Fetching phone number details...');
    const phoneNumbers = await client.incomingPhoneNumbers.list({
      phoneNumber: phoneNumber,
      limit: 1
    });

    if (phoneNumbers.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Phone number ${phoneNumber} not found in your Twilio account`
      });
    }

    const phoneNumberSid = phoneNumbers[0].sid;
    console.log(`  → Phone number SID: ${phoneNumberSid}`);

    // Construct the webhook URL using STABLE production domain
    const baseUrl = req.headers.host.includes('localhost')
      ? `http://${req.headers.host}`
      : `https://twilio-voice-ai-workshop-vercel.vercel.app`;

    const webhookUrl = `${baseUrl}/api/voice-handler?sessionToken=${encodeURIComponent(sessionToken)}`;

    console.log(`  → Setting webhook URL: ${webhookUrl}`);

    // Update the phone number configuration
    const updatedNumber = await client
      .incomingPhoneNumbers(phoneNumberSid)
      .update({
        voiceUrl: webhookUrl,
        voiceMethod: 'POST'
      });

    console.log(`  ✅ Webhook configured successfully!`);

    return res.status(200).json({
      success: true,
      message: 'Webhook configured successfully',
      phoneNumber: phoneNumber,
      webhookUrl: webhookUrl,
      phoneNumberSid: phoneNumberSid,
      friendlyName: updatedNumber.friendlyName
    });

  } catch (error) {
    console.error('Configure webhook error:', error);

    // Handle Twilio API errors
    if (error.code) {
      return res.status(400).json({
        success: false,
        error: `Twilio API Error: ${error.message}`,
        code: error.code
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to configure webhook'
    });
  }
}
