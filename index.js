/**
 * WebSocket Handler for Real-Time Voice AI (Node.js/Express)
 *
 * ⚠️ IMPORTANT: WebSocket servers cannot run on Twilio Serverless!
 * This code is designed to run on:
 * - Your own server (Node.js + Express)
 * - Heroku, Railway, Render, or similar platforms
 * - The GitHub repository you'll clone for this workshop
 *
 * How it works:
 * 1. ConversationRelay orchestrates: STT (speech-to-text), TTS (text-to-speech), and WebSocket connection
 * 2. ConversationRelay transcribes caller's speech and sends text to your WebSocket handler
 * 3. Your handler processes the text with AI/LLM (OpenAI in this example)
 * 4. Your handler sends the AI's text response back via WebSocket
 * 5. ConversationRelay converts the text to speech (TTS) and plays it to the caller
 *
 * ConversationRelay handles all the complexity of:
 * - Real-time audio streaming and transcription
 * - Low-latency bidirectional communication
 * - Interruption handling (when caller speaks over AI)
 * - TTS generation and audio playback
 * Your code just focuses on: receive text → process with AI → send text back
 */

const express = require('express');
const { WebSocketServer } = require('ws');
const OpenAI = require('openai');

const app = express();
const port = process.env.PORT || 3000;

// ============================================================================
// STEP 1: Initialize OpenAI Client
// ============================================================================
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY // Store API key in environment variable
});

// ============================================================================
// STEP 2: Create HTTP Server
// ============================================================================
const server = app.listen(port, () => {
  console.log('[SERVER] WebSocket server running on port ' + port);
});

// ============================================================================
// STEP 3: Create WebSocket Server
// ============================================================================
const wss = new WebSocketServer({
  server,  // Attach to existing HTTP server
  path: '/websocket-handler'  // Path where Twilio will connect
});

console.log('[SERVER] WebSocket server ready at ws://localhost:' + port + '/websocket-handler');

// ============================================================================
// STEP 4: Handle WebSocket Connections
// ============================================================================
wss.on('connection', (ws) => {
  console.log('[WEBSOCKET] New connection from Twilio ConversationRelay');

  // --------------------------------------------------------------------------
  // Event: MESSAGE - Handle incoming messages from Twilio
  // --------------------------------------------------------------------------
  // Twilio ConversationRelay sends JSON messages with different types:
  // - 'setup': Initial connection with call metadata
  // - 'prompt': Caller spoke (speech-to-text result)
  // - 'dtmf': Keypad button pressed
  // - 'interrupt': Caller interrupted the AI mid-sentence
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('[EVENT] Received event:', message.type);

      switch (message.type) {
        // ----------------------------------------------------------------------
        // Event: SETUP - Session initialization with call metadata
        // ----------------------------------------------------------------------
        case 'setup':
          console.log('[CALL] Setup received:');
          console.log('  Session ID:', message.sessionId);
          console.log('  Call SID:', message.callSid);
          console.log('  From:', message.from);
          console.log('  To:', message.to);
          console.log('  Direction:', message.direction);

          // Optional: Store session info for analytics/logging
          // This is useful for Conversational Intelligence integration
          break;

        // ----------------------------------------------------------------------
        // Event: PROMPT - Caller spoke, we got their words as text
        // ----------------------------------------------------------------------
        case 'prompt':
          console.log('[PROMPT] Caller said:', message.voicePrompt);
          console.log('  Language:', message.lang);
          console.log('  Is final:', message.last);

          // ====================================================================
          // AI PROCESSING: Send transcript to your LLM for intelligent response
          // ====================================================================
          // You can use ANY LLM here: OpenAI, Anthropic, Google, local models, etc.
          // Twilio handles all the audio (STT/TTS) - you just process text!
          try {
            const completion = await openai.chat.completions.create({
              model: 'gpt-4o-mini',  // Fast, affordable model (good for voice)
              messages: [
                {
                  role: 'system',
                  content: 'You are a helpful voice assistant. Keep responses brief and conversational since they will be spoken aloud.'
                },
                {
                  role: 'user',
                  content: message.voicePrompt
                }
              ],
              max_tokens: 150  // Limit response length for voice (faster TTS)
            });

            const aiResponse = completion.choices[0].message.content;
            console.log('[AI] AI response:', aiResponse);

            // ==================================================================
            // Send AI response back to Twilio → Twilio speaks it to caller
            // ==================================================================
            ws.send(JSON.stringify({
              type: 'text',
              token: aiResponse,
              last: true  // Indicates this is the complete response
            }));

          } catch (aiError) {
            console.error('[ERROR] LLM API error:', aiError);

            // Send error response to caller
            ws.send(JSON.stringify({
              type: 'text',
              token: 'I apologize, I encountered an error processing your request.',
              last: true
            }));
          }
          break;

        // ----------------------------------------------------------------------
        // Event: DTMF - Caller pressed a keypad button
        // ----------------------------------------------------------------------
        case 'dtmf':
          console.log('[DTMF] Keypad digit pressed:', message.digit);

          // Handle keypad input (useful for IVR-style menus)
          // Example: Press 1 for sales, 2 for support, etc.
          break;

        // ----------------------------------------------------------------------
        // Event: INTERRUPT - Caller interrupted the AI
        // ----------------------------------------------------------------------
        case 'interrupt':
          console.log('[INTERRUPT] Caller interrupted at:', message.utteranceUntilInterrupt);
          console.log('  Duration until interrupt:', message.durationUntilInterruptMs, 'ms');

          // Handle interruption (you may want to cancel any pending LLM requests)
          break;

        // ----------------------------------------------------------------------
        // Unknown events (log for debugging)
        // ----------------------------------------------------------------------
        default:
          console.log('[EVENT] Unknown event type:', message.type);
      }

    } catch (parseError) {
      console.error('[ERROR] Error parsing message:', parseError);
    }
  });

  // --------------------------------------------------------------------------
  // Event: ERROR - WebSocket connection error
  // --------------------------------------------------------------------------
  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });

  // --------------------------------------------------------------------------
  // Event: CLOSE - WebSocket connection closed
  // --------------------------------------------------------------------------
  ws.on('close', () => {
    console.log('[WEBSOCKET] Connection closed');
  });
});

// ============================================================================
// STEP 5: Health Check Endpoint (Optional but recommended)
// ============================================================================
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', websocket: 'ready' });
});

// ============================================================================
// DEPLOYMENT NOTES
// ============================================================================
// To deploy this code:
// 1. Push to GitHub repository
// 2. Deploy to a platform that supports WebSocket:
//    - Railway: railway.app (easiest)
//    - Render: render.com
//    - Heroku: heroku.com
//    - Your own VPS
// 3. Set environment variable: OPENAI_API_KEY=your_key_here
// 4. Update your ConversationRelay TwiML with the deployed WSS URL:
//    wss://your-app.railway.app/websocket-handler