/**
 * Make Test Call API
 *
 * Initiates a test call to verify student's AI agent configuration.
 * Calls the student's phone using their Twilio number.
 *
 * POST /api/make-test-call
 * Body: { sessionToken, testPhoneNumber }
 */

export const config = {
  runtime: 'nodejs'
};

import postgres from 'postgres';
import { applyCORS, handlePreflightRequest } from './_lib/cors.js';

const sql = postgres(process.env.POSTGRES_URL, {
  ssl: 'require',
  max: 1
});

export default async function handler(req, res) {
  // Apply CORS
  applyCORS(req, res);

  // Handle preflight
  if (handlePreflightRequest(req, res)) {
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { sessionToken, testPhoneNumber } = req.body;

    // Validation
    if (!sessionToken) {
      return res.status(400).json({
        success: false,
        error: 'sessionToken is required'
      });
    }

    if (!testPhoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'testPhoneNumber is required'
      });
    }

    // Validate phone number format (basic validation)
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    const cleanedPhone = testPhoneNumber.replace(/[\s\-\(\)]/g, '');
    if (!phoneRegex.test(cleanedPhone)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number format. Use E.164 format (e.g., +17207022122)'
      });
    }

    console.log(`📞 Test call request for session: ${sessionToken.substring(0, 20)}...`);
    console.log(`   Destination: ${testPhoneNumber}`);

    // Get student's Twilio credentials
    const configs = await sql`
      SELECT
        twilio_account_sid,
        twilio_auth_token,
        selected_phone_number,
        student_name
      FROM student_configs
      WHERE session_token = ${sessionToken}
      LIMIT 1
    `;

    if (configs.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Configuration not found for this session'
      });
    }

    const config = configs[0];
    const { twilio_account_sid, twilio_auth_token, selected_phone_number } = config;

    if (!twilio_account_sid || !twilio_auth_token) {
      return res.status(400).json({
        success: false,
        error: 'Twilio credentials not configured. Please complete Step 2 first.'
      });
    }

    // Get the first available phone number if none selected
    let fromNumber = selected_phone_number;

    if (!fromNumber) {
      console.log('   No phone number selected, fetching available numbers...');

      const phonesUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilio_account_sid}/IncomingPhoneNumbers.json`;
      const phonesResponse = await fetch(phonesUrl, {
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${twilio_account_sid}:${twilio_auth_token}`).toString('base64')
        }
      });

      if (!phonesResponse.ok) {
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch Twilio phone numbers'
        });
      }

      const phonesData = await phonesResponse.json();
      const numbers = phonesData.incoming_phone_numbers || [];

      if (numbers.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No Twilio phone numbers found. Please provision a phone number first.'
        });
      }

      fromNumber = numbers[0].phone_number;
      console.log(`   Using phone number: ${fromNumber}`);
    }

    // Make the test call
    const callUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilio_account_sid}/Calls.json`;
    const voiceHandlerUrl = `https://twilio-voice-ai-workshop-vercel.vercel.app/api/voice-handler?sessionToken=${sessionToken}`;

    const callParams = new URLSearchParams({
      To: cleanedPhone.startsWith('+') ? cleanedPhone : `+${cleanedPhone}`,
      From: fromNumber,
      Url: voiceHandlerUrl
    });

    console.log(`   Calling ${callParams.get('To')} from ${fromNumber}`);

    const callResponse = await fetch(callUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${twilio_account_sid}:${twilio_auth_token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: callParams.toString()
    });

    if (!callResponse.ok) {
      const errorText = await callResponse.text();
      console.error(`   ❌ Call failed: ${errorText}`);
      return res.status(500).json({
        success: false,
        error: `Failed to initiate call: ${errorText}`
      });
    }

    const callData = await callResponse.json();
    console.log(`   ✅ Call initiated: ${callData.sid}`);
    console.log(`   Status: ${callData.status}`);

    return res.status(200).json({
      success: true,
      message: 'Test call initiated successfully',
      callSid: callData.sid,
      status: callData.status,
      from: fromNumber,
      to: callParams.get('To')
    });

  } catch (error) {
    console.error('Test call error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to initiate test call'
    });
  }
}
