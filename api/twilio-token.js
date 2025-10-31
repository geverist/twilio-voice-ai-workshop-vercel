/**
 * Twilio Access Token API
 *
 * Generates access tokens for Twilio Client SDK (browser calling)
 * Allows users to make calls directly from their browser
 *
 * POST /api/twilio-token
 * Body: { sessionToken: string }
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
      validateRequired(req.body, ['sessionToken']);
      validateString(sessionToken, 'sessionToken', { minLength: 10, maxLength: 200 });
    } catch (validationError) {
      return handleValidationError(validationError, res);
    }

    // Get student config to retrieve Twilio credentials
    const configs = await sql`
      SELECT * FROM student_configs
      WHERE session_token = ${sessionToken}
    `;

    if (configs.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Configuration not found'
      });
    }

    const config = configs[0];

    // Get Twilio credentials from environment or stored config
    const accountSid = process.env.TWILIO_ACCOUNT_SID || config.twilio_account_sid;
    const authToken = process.env.TWILIO_AUTH_TOKEN || config.twilio_auth_token;
    const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;

    if (!accountSid || !authToken) {
      return res.status(400).json({
        success: false,
        error: 'Twilio credentials not configured. Please add your credentials in the Settings tab.'
      });
    }

    if (!twimlAppSid) {
      return res.status(400).json({
        success: false,
        error: 'Browser calling not configured. Please call your Twilio phone number directly from your phone instead.',
        requiresTwimlApp: true
      });
    }

    // Create unique identity for this browser session
    const identity = `browser_${sessionToken.substring(0, 10)}_${Date.now()}`;

    // Generate access token
    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant = AccessToken.VoiceGrant;

    const token = new AccessToken(
      accountSid,
      process.env.TWILIO_API_KEY || accountSid,
      process.env.TWILIO_API_SECRET || authToken,
      { identity }
    );

    // Grant voice capabilities
    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: twimlAppSid,
      incomingAllow: true
    });

    token.addGrant(voiceGrant);

    console.log(`✅ Generated access token for identity: ${identity}`);

    return res.status(200).json({
      success: true,
      token: token.toJwt(),
      identity: identity,
      phoneNumber: config.selected_phone_number
    });

  } catch (error) {
    console.error('Token generation error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate access token'
    });
  }
}
