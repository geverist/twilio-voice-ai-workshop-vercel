/**
 * Twilio Intelligence API
 *
 * Fetches call transcript, summary, and sentiment analysis from Twilio Intelligence
 * Used by Analytics tab to show detailed call information
 *
 * POST /api/twilio-intelligence
 * Body: {
 *   sessionToken: string (required),
 *   callSid: string (required)
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
    const { sessionToken, callSid } = req.body;

    // Validation
    if (!sessionToken) {
      return res.status(400).json({
        success: false,
        error: 'sessionToken is required'
      });
    }

    if (!callSid) {
      return res.status(400).json({
        success: false,
        error: 'callSid is required'
      });
    }

    console.log(`🧠 Fetching Intelligence data for call: ${callSid}`);

    // Get Twilio credentials from database
    const configs = await sql`
      SELECT
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
    const accountSid = config.twilio_account_sid;
    const authToken = config.twilio_auth_token;

    // Check if Twilio credentials are configured
    if (!accountSid || !authToken) {
      return res.status(400).json({
        success: false,
        error: 'Twilio credentials not found. Please connect your Twilio account in Settings first.'
      });
    }

    console.log(`  → Using Twilio Account: ${accountSid}`);

    // Fetch call details to get recording URL
    console.log('  → Fetching call details for recording...');
    const callUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${callSid}.json`;
    const callResponse = await fetch(callUrl, {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64')
      }
    });

    let recordingUrl = null;
    if (callResponse.ok) {
      const callData = await callResponse.json();

      // Fetch recordings for this call
      const recordingsUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${callSid}/Recordings.json`;
      const recordingsResponse = await fetch(recordingsUrl, {
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64')
        }
      });

      if (recordingsResponse.ok) {
        const recordingsData = await recordingsResponse.json();
        if (recordingsData.recordings && recordingsData.recordings.length > 0) {
          const recording = recordingsData.recordings[0];
          // Construct the media URL for the recording
          recordingUrl = `https://api.twilio.com${recording.uri.replace('.json', '.mp3')}`;
          console.log(`  ✅ Found recording: ${recording.sid}`);
        } else {
          console.log('  ℹ️  No recordings found for this call');
        }
      }
    }

    // Fetch call transcript from Twilio Intelligence API
    const transcriptUrl = `https://intelligence.twilio.com/v2/Transcripts?CallSid=${callSid}`;

    const transcriptResponse = await fetch(transcriptUrl, {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64')
      }
    });

    if (!transcriptResponse.ok) {
      // Intelligence might not be enabled or call might not have transcript yet
      if (transcriptResponse.status === 404) {
        console.log('  ℹ️  No Intelligence data found for this call');
        return res.status(200).json({
          success: true,
          transcript: null,
          sentences: [],
          recordingUrl: recordingUrl,
          message: 'No transcript available. Intelligence may not be enabled or call is still processing.'
        });
      }

      const errorText = await transcriptResponse.text();
      console.error('Twilio Intelligence API error:', errorText);
      return res.status(transcriptResponse.status).json({
        success: false,
        error: 'Failed to fetch Intelligence data from Twilio',
        details: errorText
      });
    }

    const transcriptData = await transcriptResponse.json();
    const transcripts = transcriptData.transcripts || [];

    if (transcripts.length === 0) {
      console.log('  ℹ️  No transcripts found for this call');
      return res.status(200).json({
        success: true,
        transcript: null,
        sentences: [],
        recordingUrl: recordingUrl,
        message: 'No transcript available yet. Call may still be processing.'
      });
    }

    // Get the first (and typically only) transcript
    const transcript = transcripts[0];
    const transcriptSid = transcript.sid;

    console.log(`  → Transcript SID: ${transcriptSid}`);

    // Fetch detailed transcript sentences
    const sentencesUrl = `https://intelligence.twilio.com/v2/Transcripts/${transcriptSid}/Sentences`;

    const sentencesResponse = await fetch(sentencesUrl, {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64')
      }
    });

    let sentences = [];
    if (sentencesResponse.ok) {
      const sentencesData = await sentencesResponse.json();
      sentences = sentencesData.sentences || [];
      console.log(`  ✅ Found ${sentences.length} transcript sentences`);
    } else {
      console.log('  ⚠️  Could not fetch transcript sentences');
    }

    // Format sentences for frontend
    const formattedSentences = sentences.map(sentence => ({
      text: sentence.transcript,
      speaker: sentence.media_channel === 0 ? 'User' : 'AI',
      confidence: sentence.confidence,
      timestamp: sentence.start_time
    }));

    // Combine into full transcript text
    const fullTranscript = formattedSentences
      .map(s => `${s.speaker}: ${s.text}`)
      .join('\n');

    // Fetch sentiment analysis
    console.log('  → Fetching sentiment analysis...');
    let sentiment = null;
    const sentimentUrl = `https://intelligence.twilio.com/v2/Transcripts/${transcriptSid}/Sentences?SentimentTag=positive,negative,neutral`;
    const sentimentResponse = await fetch(sentimentUrl, {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64')
      }
    });

    if (sentimentResponse.ok) {
      const sentimentData = await sentimentResponse.json();
      // Calculate overall sentiment from sentences
      const sentiments = { positive: 0, negative: 0, neutral: 0 };
      sentimentData.sentences?.forEach(s => {
        if (s.sentiment_tag) {
          sentiments[s.sentiment_tag] = (sentiments[s.sentiment_tag] || 0) + 1;
        }
      });

      // Determine overall sentiment
      const total = sentiments.positive + sentiments.negative + sentiments.neutral;
      if (total > 0) {
        if (sentiments.positive > sentiments.negative && sentiments.positive > sentiments.neutral) {
          sentiment = 'Positive';
        } else if (sentiments.negative > sentiments.positive && sentiments.negative > sentiments.neutral) {
          sentiment = 'Negative';
        } else {
          sentiment = 'Neutral';
        }
      }
      console.log(`  ✅ Sentiment: ${sentiment || 'Unknown'}`);
    }

    // Fetch operators (language operators detect topics and entities)
    console.log('  → Fetching language operators...');
    let operators = [];
    const operatorsUrl = `https://intelligence.twilio.com/v2/Transcripts/${transcriptSid}/OperatorResults`;
    const operatorsResponse = await fetch(operatorsUrl, {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64')
      }
    });

    if (operatorsResponse.ok) {
      const operatorsData = await operatorsResponse.json();
      operators = operatorsData.operator_results || [];
      console.log(`  ✅ Found ${operators.length} operator results`);
    }

    return res.status(200).json({
      success: true,
      transcript: fullTranscript,
      sentences: formattedSentences,
      transcriptSid: transcriptSid,
      callSid: callSid,
      recordingUrl: recordingUrl,
      sentiment: sentiment,
      operators: operators,
      metadata: {
        duration: transcript.duration,
        language: transcript.language_code,
        status: transcript.status
      }
    });

  } catch (error) {
    console.error('Intelligence API error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch Intelligence data'
    });
  }
}
