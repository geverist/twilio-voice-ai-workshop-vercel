/**
 * Call Status Callback - Creates Intelligence Transcripts
 *
 * This endpoint is called by Twilio when a call ends.
 * It creates a transcript in Twilio Intelligence for the completed call.
 *
 * POST /api/call-status-callback?sessionToken=xxx
 */

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

  try {
    const sessionToken = req.query.sessionToken;
    const { CallSid, CallStatus, RecordingUrl } = req.body;

    console.log(`📞 Call status callback: ${CallSid} - Status: ${CallStatus}`);

    // Only process completed calls
    if (CallStatus !== 'completed') {
      console.log(`  ℹ️  Skipping - call not completed yet`);
      return res.status(200).send('OK');
    }

    // Get student config for Twilio credentials
    const configs = await sql`
      SELECT
        twilio_account_sid,
        twilio_auth_token
      FROM student_configs
      WHERE session_token = ${sessionToken}
      LIMIT 1
    `;

    if (configs.length === 0) {
      console.log(`  ⚠️  No config found for session token`);
      return res.status(200).send('OK');
    }

    const config = configs[0];
    const accountSid = config.twilio_account_sid;
    const authToken = config.twilio_auth_token;
    const intelligenceServiceSid = 'GAcbdcb6980f8e7598d0411179a8d085cd';

    if (!accountSid || !authToken) {
      console.log(`  ⚠️  Missing Twilio credentials`);
      return res.status(200).send('OK');
    }

    console.log(`  → Creating Intelligence transcript for call ${CallSid}`);

    // Get recordings for this call
    const recordingsUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${CallSid}/Recordings.json`;
    const recordingsResponse = await fetch(recordingsUrl, {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64')
      }
    });

    let mediaUrl = null;
    if (recordingsResponse.ok) {
      const recordingsData = await recordingsResponse.json();
      if (recordingsData.recordings && recordingsData.recordings.length > 0) {
        const recording = recordingsData.recordings[0];
        mediaUrl = `https://api.twilio.com${recording.uri.replace('.json', '')}`;
        console.log(`  ✅ Found recording: ${recording.sid}`);
      }
    }

    if (!mediaUrl) {
      console.log(`  ⚠️  No recording found - cannot create transcript`);
      return res.status(200).send('OK');
    }

    // Create Intelligence transcript
    const transcriptUrl = `https://intelligence.twilio.com/v2/Transcripts`;
    const transcriptResponse = await fetch(transcriptUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        ServiceSid: intelligenceServiceSid,
        Channel: JSON.stringify({
          media_properties: {
            media_url: mediaUrl
          }
        })
      })
    });

    if (transcriptResponse.ok) {
      const transcriptData = await transcriptResponse.json();
      console.log(`  ✅ Created transcript: ${transcriptData.sid}`);
    } else {
      const errorText = await transcriptResponse.text();
      console.log(`  ❌ Failed to create transcript: ${errorText}`);
    }

    return res.status(200).send('OK');

  } catch (error) {
    console.error('Call status callback error:', error);
    return res.status(200).send('OK');
  }
}
