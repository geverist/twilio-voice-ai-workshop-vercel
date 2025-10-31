/**
 * Voice Handler - TwiML Endpoint for Test Calls
 *
 * This endpoint generates TwiML to connect incoming calls to ConversationRelay.
 * Used for Step 6 test calls in the workshop.
 *
 * GET/POST /api/voice-handler?sessionToken=xxx
 */

import twilio from 'twilio';
import postgres from 'postgres';
import { applyCORS, handlePreflightRequest } from './_lib/cors.js';

const VoiceResponse = twilio.twiml.VoiceResponse;

const sql = postgres(process.env.POSTGRES_URL, {
  ssl: 'require',
  max: 1
});

/**
 * Maps TTS provider and voice ID to ConversationRelay voice format
 * ConversationRelay supports: Google, Polly (Amazon), Deepgram, ElevenLabs
 */
function mapVoiceToConversationRelay(provider, voiceId) {
  switch (provider) {
    case 'elevenlabs':
      // ElevenLabs: Just use the voice ID directly
      // ConversationRelay handles the elevenlabs prefix internally
      return voiceId;

    case 'google':
      // Google voices format: Google.<language>-<variant>
      return `Google.${voiceId}`;

    case 'deepgram':
      // Deepgram Aura voices
      return `Deepgram.${voiceId}`;

    case 'amazon':
      // Amazon Polly voices
      const pollyVoices = {
        'Joanna': 'Polly.Joanna-Neural',
        'Matthew': 'Polly.Matthew-Neural',
        'Ruth': 'Polly.Ruth-Neural',
        'Stephen': 'Polly.Stephen-Neural'
      };
      return pollyVoices[voiceId] || `Polly.${voiceId}-Neural`;

    default:
      // Default fallback
      return 'Polly.Joanna-Neural';
  }
}

export default async function handler(req, res) {
  // Apply CORS
  applyCORS(req, res);

  // Handle preflight
  if (handlePreflightRequest(req, res)) {
    return;
  }

  try {
    // Get sessionToken from query params (for identifying the student)
    const sessionToken = req.query.sessionToken || null;

    // Default configuration
    let voice = 'Polly.Joanna-Neural';
    let welcomeGreeting = 'Hello! I am your AI assistant. How can I help you today?';
    let ttsProvider = 'elevenlabs';
    let selectedVoice = 'Xb7hH8MSUJpSbSDYk0k2'; // ElevenLabs default (Alice)

    // Fetch student's configuration if sessionToken is provided
    if (sessionToken) {
      console.log(`🔍 Fetching config for sessionToken: ${sessionToken.substring(0, 20)}...`);
      try {
        const configs = await sql`
          SELECT
            tts_provider,
            selected_voice,
            ivr_greeting
          FROM student_configs
          WHERE session_token = ${sessionToken}
        `;

        console.log(`📊 Found ${configs.length} config(s) for session token`);

        if (configs.length > 0) {
          const config = configs[0];
          console.log(`📦 Raw config from DB:`, JSON.stringify({
            tts_provider: config.tts_provider,
            selected_voice: config.selected_voice,
            ivr_greeting: config.ivr_greeting?.substring(0, 50)
          }));

          ttsProvider = config.tts_provider || 'elevenlabs';
          selectedVoice = config.selected_voice || 'Xb7hH8MSUJpSbSDYk0k2';
          welcomeGreeting = config.ivr_greeting || welcomeGreeting;

          // Map TTS provider and voice to ConversationRelay format
          voice = mapVoiceToConversationRelay(ttsProvider, selectedVoice);

          console.log(`✅ VOICE CONFIG: provider=${ttsProvider}, voiceId=${selectedVoice} → ConversationRelay voice="${voice}"`);
        } else {
          console.warn(`⚠️  No config found for session token, using defaults`);
        }
      } catch (dbError) {
        console.error('❌ Failed to fetch student config:', dbError.message);
        console.warn('⚠️  Using default configuration');
      }
    } else {
      console.warn('⚠️  No sessionToken provided, using default configuration');
    }

    // Create TwiML response with ConversationRelay
    const twiml = new VoiceResponse();

    // Use ConversationRelay to connect call to AI
    const connect = twiml.connect();

    // ConversationRelay configuration
    const conversationRelay = connect.conversationRelay({
      url: `wss://${req.headers.host}/api/workshop-websocket${sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : ''}`,
      welcomeGreeting: welcomeGreeting,
      dtmfDetection: true,
      voice: voice
    });

    // Set response headers for TwiML
    res.setHeader('Content-Type', 'text/xml');
    const twimlString = twiml.toString();
    res.status(200).send(twimlString);

    console.log(`✅ Generated TwiML for session: ${sessionToken || 'anonymous'}`);
    console.log(`🎤 FINAL VOICE USED: "${voice}"`);
    console.log(`💬 FINAL GREETING: "${welcomeGreeting.substring(0, 50)}..."`);
    console.log(`📝 TwiML (first 500 chars): ${twimlString.substring(0, 500)}`);

  } catch (error) {
    console.error('Error generating TwiML:', error);

    // Return error TwiML
    const errorTwiml = new VoiceResponse();
    errorTwiml.say('Sorry, there was an error connecting your call. Please try again later.');
    errorTwiml.hangup();

    res.setHeader('Content-Type', 'text/xml');
    res.status(200).send(errorTwiml.toString());
  }
}
