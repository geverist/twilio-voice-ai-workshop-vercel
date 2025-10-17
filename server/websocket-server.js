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

wss.on('connection', (ws, req) => {
  // Parse query parameters from URL
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const openaiApiKey = url.searchParams.get('apiKey');
  const sessionId = url.searchParams.get('sessionId') || 'default';

  console.log(`[${sessionId}] WebSocket connected`);

  if (!openaiApiKey) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Missing apiKey parameter in connection URL'
    }));
    ws.close();
    return;
  }

  // Initialize OpenAI client with student's API key
  const openai = new OpenAI({ apiKey: openaiApiKey });

  // Store conversation history
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
  console.log(`  - WebSocket: ws://localhost:${PORT}?apiKey=YOUR_KEY&sessionId=test`);
  console.log(`  - Health check: http://localhost:${PORT}`);
  console.log(`\n💡 Usage:`);
  console.log(`  Connect with: ws://localhost:${PORT}?apiKey=sk-xxx&sessionId=my-session`);
});
