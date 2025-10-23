/**
 * Voice Handler - TwiML Endpoint for Test Calls
 *
 * This endpoint generates TwiML to connect incoming calls to ConversationRelay.
 * Used for Step 6 test calls in the workshop.
 *
 * GET/POST /api/voice-handler?sessionToken=xxx
 */

import twilio from 'twilio';
import { applyCORS, handlePreflightRequest } from './_lib/cors.js';

const VoiceResponse = twilio.twiml.VoiceResponse;

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

    // Create TwiML response with ConversationRelay
    const twiml = new VoiceResponse();

    // Use ConversationRelay to connect call to AI
    const connect = twiml.connect();

    // ConversationRelay configuration
    const conversationRelay = connect.conversationRelay({
      url: `wss://${req.headers.host}/api/workshop-websocket${sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : ''}`,
      voice: 'Polly.Joanna-Neural', // Default voice
      welcomeGreeting: 'Hello! I am your AI assistant. How can I help you today?',
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
