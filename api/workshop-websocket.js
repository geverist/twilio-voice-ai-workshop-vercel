/**
 * Workshop WebSocket Handler (Vercel Version)
 *
 * Shared WebSocket endpoint for all workshop students.
 * Handles ConversationRelay connections and routes to OpenAI.
 *
 * Note: This is a WORKSHOP-ONLY solution. For production, students should
 * deploy their own WebSocket servers to Railway/Render/Heroku.
 */

import OpenAI from 'openai';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  const upgrade = req.headers.get('upgrade') || '';

  if (upgrade.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket', { status: 426 });
  }

  const url = new URL(req.url);
  const sessionToken = url.searchParams.get('sessionToken') || null;
  const sessionId = sessionToken || 'default';

  // Vercel Edge Runtime WebSocket support
  const pair = new WebSocketPair();
  const [client, server] = [pair[0], pair[1]];

  server.accept();
  handleWebSocket(server, sessionToken, sessionId);

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

async function handleWebSocket(ws, sessionToken, sessionId) {
  console.log(`[${sessionId}] WebSocket connected (session: ${sessionToken || 'demo'})`);

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
      // Fetch student settings from database (includes decrypted OpenAI key)
      const settingsResponse = await fetch(
        `https://${process.env.VERCEL_URL || 'localhost:3000'}/api/get-student-ai-settings?sessionToken=${encodeURIComponent(sessionToken)}`
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
            console.warn(`[${sessionId}] ⚠️ No OpenAI API key found for student. Student needs to configure their key in Step 1.`);
          }
        }
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
        error: 'No OpenAI API key configured. Please configure your OpenAI API key in Step 1.'
      }));
      ws.close();
      return;
    }
    console.log(`[${sessionId}] Using instructor's OpenAI API key (student key not configured)`);
  } else {
    console.log(`[${sessionId}] ✅ Using student's OpenAI API key`);
  }

  // Initialize OpenAI client with student's API key (or instructor's as fallback)
  const openai = new OpenAI({ apiKey: openaiApiKey });

  // Store conversation history
  const conversationHistory = [];

  // Send greeting when connection opens
  ws.addEventListener('open', () => {
    console.log(`[${sessionId}] Sending greeting: "${studentSettings.greeting}"`);
  });

  ws.addEventListener('message', async (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log(`[${sessionId}] Received event:`, data.type);

      switch (data.type) {
        // Setup event - call started
        case 'setup':
          console.log(`[${sessionId}] Call setup:`, {
            from: data.from,
            to: data.to,
            direction: data.direction
          });
          break;

        // Prompt event - caller spoke
        case 'prompt':
          console.log(`[${sessionId}] Caller said:`, data.voicePrompt);

          // Add to conversation history
          conversationHistory.push({
            role: 'user',
            content: data.voicePrompt
          });

          try {
            // Call OpenAI with student's custom system prompt
            const completion = await openai.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: studentSettings.systemPrompt
                },
                ...conversationHistory
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
            console.error(`[${sessionId}] OpenAI error:`, aiError);

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
          console.log(`[${sessionId}] DTMF digit:`, data.digit);
          break;

        // Interrupt event - caller interrupted
        case 'interrupt':
          console.log(`[${sessionId}] Caller interrupted at:`, data.utteranceUntilInterrupt);
          break;

        default:
          console.log(`[${sessionId}] Unknown event type:`, data.type);
      }

    } catch (error) {
      console.error(`[${sessionId}] Error parsing message:`, error);
    }
  });

  ws.addEventListener('close', () => {
    console.log(`[${sessionId}] WebSocket closed`);
  });

  ws.addEventListener('error', (error) => {
    console.error(`[${sessionId}] WebSocket error:`, error);
  });
}
