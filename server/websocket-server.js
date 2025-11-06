/**
 * Local WebSocket Server for Testing
 *
 * Standalone server that runs the workshop WebSocket handler locally.
 * This allows testing without deploying to Vercel.
 *
 * Run with: node server/websocket-server.js
 */

import { WebSocketServer } from 'ws';
import OpenAI from 'openai';
import http from 'http';

const PORT = 8080;

// Create HTTP server for health checks
const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'running',
    message: 'WebSocket server is running',
    websocketUrl: `ws://localhost:${PORT}`
  }));
});

// Create WebSocket server
const wss = new WebSocketServer({ server: httpServer });

console.log(`🚀 WebSocket server starting on ws://localhost:${PORT}`);

wss.on('connection', async (ws, req) => {
  // Parse query parameters from URL
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const sessionToken = url.searchParams.get('sessionToken');
  const sessionId = sessionToken || 'default';

  console.log(`[${sessionId}] WebSocket connected (session: ${sessionToken || 'no-token'})`);

  // Load student's custom AI settings and OpenAI API key
  let studentSettings = {
    systemPrompt: 'You are a helpful voice assistant. Keep responses brief and conversational since they will be spoken aloud.',
    greeting: 'Hello! How can I help you today?',
    voice: 'alloy',
    tools: []
  };
  let openaiApiKey = null;

  if (sessionToken) {
    try {
      // Fetch student settings from Vercel API (includes decrypted OpenAI key)
      const apiBaseUrl = process.env.VERCEL_API_URL || 'https://twilio-voice-ai-workshop-vercel.vercel.app';
      const settingsResponse = await fetch(
        `${apiBaseUrl}/api/get-student-ai-settings?sessionToken=${encodeURIComponent(sessionToken)}`
      );

      if (settingsResponse.ok) {
        const data = await settingsResponse.json();
        if (data.success && data.settings) {
          studentSettings = {
            systemPrompt: data.settings.systemPrompt || studentSettings.systemPrompt,
            greeting: data.settings.greeting || studentSettings.greeting,
            voice: data.settings.voice || studentSettings.voice,
            tools: data.settings.tools || studentSettings.tools
          };
          openaiApiKey = data.settings.openaiApiKey;
          console.log(`[${sessionId}] Loaded custom settings for session ${sessionToken}`);

          if (!openaiApiKey) {
            console.warn(`[${sessionId}] ⚠️  No OpenAI API key found for student`);
          }
        }
      } else {
        console.warn(`[${sessionId}] Failed to fetch settings: ${settingsResponse.status}`);
      }
    } catch (error) {
      console.warn(`[${sessionId}] Could not load student settings:`, error.message);
    }
  }

  // Fallback to instructor's key if student hasn't configured their own yet
  if (!openaiApiKey) {
    openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      console.error(`[${sessionId}] ❌ No OpenAI API key available (neither student nor instructor key found)`);
      ws.send(JSON.stringify({
        type: 'error',
        error: 'No OpenAI API key configured. Please configure your OpenAI API key in the workshop.'
      }));
      ws.close();
      return;
    }
    console.log(`[${sessionId}] Using instructor's OpenAI API key (fallback)`);
  } else {
    console.log(`[${sessionId}] ✅ Using student's OpenAI API key`);
  }

  // Initialize OpenAI client with student's API key (or instructor's as fallback)
  const openai = new OpenAI({ apiKey: openaiApiKey });

  // =========================================================================
  // STATEFUL PROMPT ENGINEERING: Conversation Memory
  // =========================================================================
  // This array maintains the complete conversation history for this call.
  // Each user message and AI response is added to this array and sent with
  // every new OpenAI API request, enabling:
  //
  // ✅ Context awareness - AI remembers what was said earlier
  // ✅ Pronoun resolution - "Change it to Thursday" (AI knows what "it" is)
  // ✅ Progressive information gathering - Collect details across turns
  // ✅ Conversation repair - "Actually, I meant Wednesday"
  // ✅ Personalization - "Hi, I'm Sarah" → AI uses name for rest of call
  //
  // ⚠️  Important: Full history is sent with EVERY request (costs tokens!)
  // ⚠️  Privacy: History stored in memory during call, cleared when call ends
  // =========================================================================
  const conversationHistory = [];

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`[${sessionId}] Received event:`, message.type);

      switch (message.type) {
        // Setup event - call started
        case 'setup':
          console.log(`[${sessionId}] Call setup:`, {
            from: message.from,
            to: message.to,
            direction: message.direction
          });
          break;

        // Prompt event - caller spoke
        case 'prompt':
          console.log(`[${sessionId}] Caller said:`, message.voicePrompt);

          // Add to conversation history
          conversationHistory.push({
            role: 'user',
            content: message.voicePrompt
          });

          try {
            // ===================================================================
            // OPENAI API CALL WITH CONVERSATION MEMORY
            // ===================================================================
            // The messages array is the key to stateful conversations:
            //
            // 1. System prompt (first message) - Defines AI personality/behavior
            // 2. ...conversationHistory (rest) - ALL previous turns in the call
            //
            // Example messages array after 3 turns:
            // [
            //   { role: "system", content: "You are a helpful assistant..." },
            //   { role: "user", content: "Hi, I need an appointment" },
            //   { role: "assistant", content: "I'd be happy to help!" },
            //   { role: "user", content: "How about Tuesday at 2pm?" },
            //   { role: "assistant", content: "Perfect! I'll book that." },
            //   { role: "user", content: "Actually, can we do 3pm?" },  ← current
            // ]
            //
            // The AI can see ALL previous messages, so it knows:
            // - "We" refers to the appointment being discussed
            // - "3pm" is changing the time from the previously mentioned "2pm"
            // - Tuesday is still the day (hasn't changed)
            //
            // This enables natural, context-aware conversations! 🎯
            // ===================================================================
            const completion = await openai.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: studentSettings.systemPrompt
                },
                ...conversationHistory  // ← Full conversation history included
              ],
              max_tokens: 150,
              temperature: 0.7
            });

            const aiResponse = completion.choices[0].message.content;
            console.log(`[${sessionId}] AI response:`, aiResponse);

            // Add to conversation history
            conversationHistory.push({
              role: 'assistant',
              content: aiResponse
            });

            // Send response back to Twilio
            ws.send(JSON.stringify({
              type: 'text',
              token: aiResponse,
              last: true
            }));

          } catch (aiError) {
            console.error(`[${sessionId}] OpenAI error:`, aiError.message);

            // Send error response
            ws.send(JSON.stringify({
              type: 'text',
              token: 'I apologize, I encountered an error processing your request.',
              last: true
            }));
          }
          break;

        // DTMF event - keypad pressed
        case 'dtmf':
          console.log(`[${sessionId}] DTMF digit:`, message.digit);
          break;

        // Interrupt event - caller interrupted
        case 'interrupt':
          console.log(`[${sessionId}] Caller interrupted at:`, message.utteranceUntilInterrupt);
          break;

        default:
          console.log(`[${sessionId}] Unknown event type:`, message.type);
      }

    } catch (error) {
      console.error(`[${sessionId}] Error parsing message:`, error);
    }
  });

  ws.on('close', () => {
    console.log(`[${sessionId}] WebSocket closed`);
  });

  ws.on('error', (error) => {
    console.error(`[${sessionId}] WebSocket error:`, error);
  });
});

httpServer.listen(PORT, () => {
  console.log(`✓ WebSocket server ready!`);
  console.log(`  - WebSocket: ws://localhost:${PORT}/ws?sessionToken=YOUR_SESSION_TOKEN`);
  console.log(`  - Health check: http://localhost:${PORT}`);
  console.log(`\n💡 Usage:`);
  console.log(`  1. Get sessionToken from workshop (Step 1)`);
  console.log(`  2. Connect with: ws://localhost:${PORT}/ws?sessionToken=ws_xxx`);
  console.log(`  3. Server will fetch your OpenAI key from database`);
  console.log(`\n🔑 Environment Variables:`);
  console.log(`  - VERCEL_API_URL: ${process.env.VERCEL_API_URL || 'https://twilio-voice-ai-workshop-vercel.vercel.app (default)'}`);
  console.log(`  - OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✓ Set (fallback)' : '✗ Not set'}`);
});
