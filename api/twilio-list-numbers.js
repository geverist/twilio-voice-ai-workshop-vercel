/**
 * Twilio List Phone Numbers API
 *
 * Fetches all phone numbers from the Twilio account
 * Used by admin panel to populate phone number dropdown
 *
 * GET /api/twilio-list-numbers?sessionToken=xxx
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

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const allowed = await applyRateLimit(req, res);
  if (!allowed) {
    return;
  }

  try {
    const { sessionToken } = req.query;

    // Validation
    try {
      validateRequired({ sessionToken }, ['sessionToken']);
      validateString(sessionToken, 'sessionToken', { minLength: 10, maxLength: 200 });
    } catch (validationError) {
      return handleValidationError(validationError, res);
    }

    // Get Twilio credentials from student config or environment
    const configs = await sql`
      SELECT twilio_account_sid, twilio_auth_token
      FROM student_configs
      WHERE session_token = ${sessionToken}
    `;

    let accountSid, authToken;

    if (configs.length > 0 && configs[0].twilio_account_sid && configs[0].twilio_auth_token) {
      // Use student's Twilio credentials
      accountSid = configs[0].twilio_account_sid;
      authToken = configs[0].twilio_auth_token;
      console.log(`📞 Using student's Twilio credentials for session: ${sessionToken.substring(0, 10)}...`);
    } else {
      // Fall back to environment variables
      accountSid = process.env.TWILIO_ACCOUNT_SID;
      authToken = process.env.TWILIO_AUTH_TOKEN;
      console.log(`📞 Using environment Twilio credentials (student credentials not configured)`);
    }

    if (!accountSid || !authToken) {
      return res.status(400).json({
        success: false,
        error: 'Twilio credentials not configured. Please add your credentials in the Settings tab.'
      });
    }

    // Initialize Twilio client
    const client = twilio(accountSid, authToken);

    // Fetch phone numbers
    console.log(`🔍 Fetching phone numbers for account: ${accountSid.substring(0, 10)}...`);
    const phoneNumbers = await client.incomingPhoneNumbers.list({ limit: 100 });

    console.log(`✅ Found ${phoneNumbers.length} phone numbers`);

    // Format phone numbers for dropdown
    const formattedNumbers = phoneNumbers.map(number => ({
      phoneNumber: number.phoneNumber,
      friendlyName: number.friendlyName,
      capabilities: {
        voice: number.capabilities.voice,
        sms: number.capabilities.sms,
        mms: number.capabilities.mms
      }
    }));

    return res.status(200).json({
      success: true,
      phoneNumbers: formattedNumbers,
      count: formattedNumbers.length
    });

  } catch (error) {
    console.error('Error fetching phone numbers:', error);

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
      error: error.message || 'Failed to fetch phone numbers'
    });
  }
}
