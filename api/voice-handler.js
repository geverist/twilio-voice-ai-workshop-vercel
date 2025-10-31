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
      // ElevenLabs uses voice IDs directly
      // Format: elevenlabs.<voice_id>
      return `elevenlabs.${voiceId}`;

    case 'google':
      // Google voices format: Google.<language>-<variant>
      // Map common voice IDs to Google format
      const googleVoices = {
        'en-US-Neural2-A': 'Google.en-US-Neural2-A',
        'en-US-Neural2-C': 'Google.en-US-Neural2-C',
        'en-US-Neural2-D': 'Google.en-US-Neural2-D',
        'en-US-Neural2-F': 'Google.en-US-Neural2-F'
      };
      return googleVoices[voiceId] || `Google.${voiceId}`;

    case 'deepgram':
      // Deepgram Aura voices format: aura-<name>-en
      // ConversationRelay expects: Deepgram.<voice>
      return `Deepgram.${voiceId}`;

    case 'amazon':
      // Amazon Polly voices format: Polly.<voice>-Neural
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
      try {
        const configs = await sql`
          SELECT
            tts_provider,
            selected_voice,
            ivr_greeting
          FROM student_configs
          WHERE session_token = ${sessionToken}
        `;

        if (configs.length > 0) {
          const config = configs[0];
          ttsProvider = config.tts_provider || 'elevenlabs';
          selectedVoice = config.selected_voice || 'Xb7hH8MSUJpSbSDYk0k2';
          welcomeGreeting = config.ivr_greeting || welcomeGreeting;

          // Map TTS provider and voice to ConversationRelay format
          voice = mapVoiceToConversationRelay(ttsProvider, selectedVoice);

          console.log(`✅ Loaded config for session ${sessionToken.substring(0, 8)}: provider=${ttsProvider}, voice=${selectedVoice} → ${voice}`);
        }
      } catch (dbError) {
        console.warn('Failed to fetch student config, using defaults:', dbError.message);
      }
    }

    // Create TwiML response with ConversationRelay
    const twiml = new VoiceResponse();

    // Use ConversationRelay to connect call to AI
    const connect = twiml.connect();

    // ConversationRelay configuration
    const conversationRelay = connect.conversationRelay({
      url: `wss://${req.headers.host}/api/workshop-websocket${sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : ''}`,
      voice: voice,
      welcomeGreeting: welcomeGreeting,
      dtmfDetection: true
    });

    // Set response headers for TwiML
    res.setHeader('Content-Type', 'text/xml');
    res.status(200).send(twiml.toString());

    console.log(`✅ Generated TwiML for session: ${sessionToken || 'anonymous'}`);

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
