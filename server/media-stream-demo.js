/**
 * Media Streams Demo Server
 *
 * This demonstrates how Twilio Media Streams work - the foundation of ConversationRelay.
 *
 * Flow:
 * 1. Browser captures raw audio from microphone
 * 2. Sends audio chunks via WebSocket (like Twilio does)
 * 3. Server receives audio and sends back audio response
 * 4. Browser plays the audio
 *
 * This is EXACTLY how ConversationRelay works under the hood!
 *
 * Run with: node server/media-stream-demo.js
 */

import { WebSocketServer } from 'ws';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 8082;

// Create HTTP server
const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'running',
    message: 'Media Streams Demo Server',
    websocketUrl: `ws://localhost:${PORT}`,
    info: 'This demonstrates how Twilio Media Streams work'
  }));
});

// Create WebSocket server
const wss = new WebSocketServer({ server: httpServer });

console.log(`🚀 Media Streams Demo Server starting on ws://localhost:${PORT}`);

wss.on('connection', (ws, req) => {
  const sessionId = `session_${Date.now()}`;
  console.log(`[${sessionId}] 🎙️ Media stream connected`);

  let audioChunksReceived = 0;
  let firstChunkTime = null;
  let utteranceCount = 0;
  let silenceDetected = false;
  let lastChunkTime = Date.now();

  ws.on('message', async (data) => {
    // Check if it's binary audio data
    if (data instanceof Buffer) {
      audioChunksReceived++;
      const now = Date.now();

      if (!firstChunkTime) {
        firstChunkTime = now;
        utteranceCount++;
        console.log(`[${sessionId}] 📊 Utterance #${utteranceCount} started - receiving audio stream...`);

        // Notify browser that utterance started
        ws.send(JSON.stringify({
          type: 'utteranceStart',
          utteranceNumber: utteranceCount,
          timestamp: new Date().toISOString()
        }));
      }

      // Update progress every 50 chunks
      if (audioChunksReceived % 50 === 0) {
        const duration = ((now - firstChunkTime) / 1000).toFixed(1);
        ws.send(JSON.stringify({
          type: 'audioProgress',
          chunksReceived: audioChunksReceived,
          duration: duration
        }));
      }

      // Detect potential end of utterance (silence or enough audio)
      // Simulate: after 200 chunks (~2s), treat as end of utterance
      if (audioChunksReceived >= 200 && !silenceDetected) {
        silenceDetected = true;
        const duration = ((now - firstChunkTime) / 1000).toFixed(1);

        console.log(`[${sessionId}] 🎯 Utterance #${utteranceCount} complete (${duration}s, ${audioChunksReceived} chunks)`);

        // Send utterance completion event
        ws.send(JSON.stringify({
          type: 'utteranceEnd',
          utteranceNumber: utteranceCount,
          chunksReceived: audioChunksReceived,
          duration: duration,
          simulatedTranscript: generateSimulatedTranscript(utteranceCount)
        }));

        // Simulate processing delay (like STT + LLM would take)
        await new Promise(resolve => setTimeout(resolve, 300));

        // Send simulated AI response
        const aiResponse = generateSimulatedResponse(utteranceCount);
        ws.send(JSON.stringify({
          type: 'aiResponse',
          utteranceNumber: utteranceCount,
          text: aiResponse
        }));

        console.log(`[${sessionId}] 💬 AI Response sent for utterance #${utteranceCount}`);

        // Simulate TTS audio generation delay
        await new Promise(resolve => setTimeout(resolve, 200));

        // Send instruction to browser to speak the response
        ws.send(JSON.stringify({
          type: 'speak',
          text: aiResponse
        }));

        // Reset for next utterance
        audioChunksReceived = 0;
        firstChunkTime = null;
        silenceDetected = false;
      }

      lastChunkTime = now;

    } else {
      // Handle JSON control messages
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case 'start':
            console.log(`[${sessionId}] ▶️  Stream started`);
            ws.send(JSON.stringify({
              type: 'status',
              message: 'Ready to receive audio stream'
            }));
            break;

          case 'transcript':
            // Receive transcript from browser (simulating what Twilio STT would provide)
            if (message.isFinal) {
              console.log(`[${sessionId}] 📝 Transcript (final): "${message.text}"`);
            } else {
              console.log(`[${sessionId}] 📝 Transcript (interim): "${message.text}"`);
            }
            break;

          case 'stop':
            console.log(`[${sessionId}] ⏸️  Stream stopped`);
            console.log(`[${sessionId}] 📊 Total chunks received: ${audioChunksReceived}`);
            break;

          default:
            console.log(`[${sessionId}] ⚠️  Unknown message type:`, message.type);
        }
      } catch (error) {
        console.error(`[${sessionId}] ❌ Error parsing message:`, error.message);
      }
    }
  });

  ws.on('close', () => {
    console.log(`[${sessionId}] 🔌 Media stream disconnected`);
    if (audioChunksReceived > 0) {
      console.log(`[${sessionId}] 📊 Session stats: ${audioChunksReceived} audio chunks received`);
    }
  });

  ws.on('error', (error) => {
    console.error(`[${sessionId}] ❌ WebSocket error:`, error.message);
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Media Streams Demo - Ready to receive audio',
    info: 'This is how Twilio Media Streams work!'
  }));
});

// Helper function to generate simulated transcripts (fallback if browser doesn't send real ones)
function generateSimulatedTranscript(utteranceNumber) {
  const transcripts = [
    "Hello, how are you?",
    "Tell me about Twilio Media Streams",
    "What can ConversationRelay do?",
    "This is really cool!",
    "I understand now, thank you"
  ];
  return transcripts[(utteranceNumber - 1) % transcripts.length];
}

// Helper function to generate simulated AI responses
function generateSimulatedResponse(utteranceNumber) {
  const responses = [
    "Hello! I'm doing great. I just received your audio via Media Streams!",
    "Media Streams let you send raw audio from phone calls to WebSockets in real-time. It's the foundation of voice AI!",
    "ConversationRelay adds AI orchestration on top of Media Streams - handling STT, TTS, low latency, and interruptions automatically!",
    "Thanks! This demonstrates how real-time audio streaming works with Twilio.",
    "You're welcome! Ready to try ConversationRelay in the next step?"
  ];
  return responses[(utteranceNumber - 1) % responses.length];
}

httpServer.listen(PORT, () => {
  console.log(`✓ Media Streams Demo Server ready!`);
  console.log(`  - WebSocket: ws://localhost:${PORT}`);
  console.log(`  - Health check: http://localhost:${PORT}`);
  console.log(`\n📚 What this demonstrates:`);
  console.log(`  - Browser captures raw audio from microphone`);
  console.log(`  - Audio is sent as binary chunks via WebSocket`);
  console.log(`  - Server receives and processes the audio stream`);
  console.log(`  - This is EXACTLY how Twilio Media Streams work!`);
  console.log(`\n🎯 ConversationRelay uses Media Streams to:`);
  console.log(`  - Stream phone call audio to your WebSocket`);
  console.log(`  - Receive audio responses from your handler`);
  console.log(`  - Handle bidirectional real-time audio`);
});
