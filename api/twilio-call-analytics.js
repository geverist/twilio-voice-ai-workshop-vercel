/**
 * Twilio Call Analytics API
 *
 * Fetches call logs and analytics from Twilio API for a given phone number
 * Returns metrics like call count, duration, status, and detailed call logs
 * Credentials are automatically loaded from database based on sessionToken
 *
 * POST /api/twilio-call-analytics
 * Body: {
 *   sessionToken: string (required)
 * }
 */

import { applyCORS, handlePreflightRequest } from './_lib/cors.js';
import { applyRateLimit } from './_lib/ratelimit.js';
import postgres from 'postgres';

// Create postgres connection
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

  // Apply rate limiting
  const allowed = await applyRateLimit(req, res);
  if (!allowed) {
    return;
  }

  try {
    const { sessionToken } = req.body;

    // Validation
    if (!sessionToken) {
      return res.status(400).json({
        success: false,
        error: 'sessionToken is required'
      });
    }

    console.log(`📊 Fetching call analytics for session: ${sessionToken.substring(0, 20)}...`);

    // Get student config to find their phone number and Twilio credentials
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
      return res.status(200).json({
        success: true,
        calls: [],
        metrics: {
          totalCalls: 0,
          answeredCalls: 0,
          failedCalls: 0,
          totalDuration: 0,
          averageDuration: 0
        },
        message: 'No phone number configured'
      });
    }

    console.log(`  → Using Twilio Account: ${accountSid}`);
    console.log(`  → Fetching calls for phone: ${phoneNumber}`);

    // Fetch calls from Twilio API
    // Get calls from the last 30 days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const startDateStr = startDate.toISOString().split('T')[0];

    console.log(`  → From date: ${startDateStr}`);

    // Build Twilio API URL with filters
    const apiUrl = new URL(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`);
    apiUrl.searchParams.append('To', phoneNumber);
    apiUrl.searchParams.append('StartTime>', startDateStr);
    apiUrl.searchParams.append('PageSize', '100');

    const twilioResponse = await fetch(apiUrl.toString(), {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64')
      }
    });

    if (!twilioResponse.ok) {
      const errorText = await twilioResponse.text();
      console.error('Twilio API error:', errorText);
      return res.status(twilioResponse.status).json({
        success: false,
        error: 'Failed to fetch calls from Twilio',
        details: errorText
      });
    }

    const twilioData = await twilioResponse.json();
    const calls = twilioData.calls || [];

    console.log(`  ✅ Found ${calls.length} calls`);

    // Calculate metrics
    const metrics = {
      totalCalls: calls.length,
      answeredCalls: calls.filter(c => c.status === 'completed').length,
      failedCalls: calls.filter(c => c.status === 'failed' || c.status === 'busy' || c.status === 'no-answer').length,
      inProgressCalls: calls.filter(c => c.status === 'in-progress' || c.status === 'ringing').length,
      totalDuration: calls.reduce((sum, c) => sum + parseInt(c.duration || 0), 0),
      averageDuration: 0
    };

    if (metrics.answeredCalls > 0) {
      const completedCalls = calls.filter(c => c.status === 'completed');
      const totalCompletedDuration = completedCalls.reduce((sum, c) => sum + parseInt(c.duration || 0), 0);
      metrics.averageDuration = Math.round(totalCompletedDuration / metrics.answeredCalls);
    }

    // Format calls for frontend
    const formattedCalls = calls.map(call => ({
      sid: call.sid,
      from: call.from,
      to: call.to,
      status: call.status,
      direction: call.direction,
      duration: parseInt(call.duration || 0),
      startTime: call.start_time,
      endTime: call.end_time,
      price: call.price,
      priceUnit: call.price_unit
    }));

    // Sort by start time (most recent first)
    formattedCalls.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

    return res.status(200).json({
      success: true,
      calls: formattedCalls,
      metrics: metrics,
      phoneNumber: phoneNumber,
      dateRange: {
        from: startDateStr,
        to: new Date().toISOString().split('T')[0]
      }
    });

  } catch (error) {
    console.error('Call analytics error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch call analytics'
    });
  }
}
