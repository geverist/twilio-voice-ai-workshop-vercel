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
  runtime: 'edge', // Use Edge runtime for WebSocket support
};

export default async function handler(req) {
  const upgradeHeader = req.headers.get('upgrade');

  // Check if this is a WebSocket upgrade request
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 });
  }

  // Get OpenAI API key from query params (students pass their own key)
  const url = new URL(req.url);
  const openaiApiKey = url.searchParams.get('apiKey');
  const sessionId = url.searchParams.get('sessionId') || 'default';

  if (!openaiApiKey) {
    return new Response('Missing apiKey parameter', { status: 400 });
  }

  // Create WebSocket pair
  const { 0: client, 1: server } = new WebSocketPair();

  // Handle WebSocket connection
  handleWebSocket(server, openaiApiKey, sessionId);

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

async function handleWebSocket(ws, openaiApiKey, sessionId) {
  console.log(`[${sessionId}] WebSocket connected`);

  // Initialize OpenAI client with student's API key
  const openai = new OpenAI({ apiKey: openaiApiKey });

  // Store conversation history
  const conversationHistory = [];

  // Accept the WebSocket connection
  ws.accept();

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
            // Call OpenAI
            const completion = await openai.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: 'You are a helpful voice assistant. Keep responses brief and conversational since they will be spoken aloud.'
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
