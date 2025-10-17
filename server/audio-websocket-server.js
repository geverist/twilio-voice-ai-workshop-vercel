/**
 * Raw Audio WebSocket Server
 *
 * Handles real-time audio streaming with Deepgram (STT) and ElevenLabs (TTS).
 * This mimics how ConversationRelay actually works with raw audio.
 *
 * Flow:
 * 1. Browser captures raw audio from microphone
 * 2. Sends audio chunks via WebSocket
 * 3. Server streams to Deepgram for STT
 * 4. Server sends text to OpenAI for LLM processing
 * 5. Server sends response to ElevenLabs for TTS
 * 6. Server streams audio back to browser for playback
 *
 * Run with: node server/audio-websocket-server.js
 */

import { WebSocketServer } from 'ws';
import { createClient } from '@deepgram/sdk';
import OpenAI from 'openai';
import http from 'http';
import fetch from 'node-fetch';

const PORT = 8081;

// Create HTTP server for health checks
const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'running',
    message: 'Raw audio WebSocket server is running',
    websocketUrl: `ws://localhost:${PORT}`,
    capabilities: ['raw-audio', 'deepgram-stt', 'openai-llm', 'elevenlabs-tts']
  }));
});

// Create WebSocket server
const wss = new WebSocketServer({ server: httpServer });

console.log(`🚀 Raw Audio WebSocket server starting on ws://localhost:${PORT}`);

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const openaiApiKey = url.searchParams.get('openaiKey');
  const deepgramApiKey = url.searchParams.get('deepgramKey');
  const elevenlabsApiKey = url.searchParams.get('elevenlabsKey');
  const sessionId = url.searchParams.get('sessionId') || 'default';

  console.log(`[${sessionId}] 🎙️ Raw audio connection established`);

  // Validate API keys
  if (!openaiApiKey || !deepgramApiKey || !elevenlabsApiKey) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Missing required API keys. Need: openaiKey, deepgramKey, elevenlabsKey'
    }));
    ws.close();
    return;
  }

  // Initialize clients
  const openai = new OpenAI({ apiKey: openaiApiKey });
  const deepgram = createClient(deepgramApiKey);

  // Session state
  let conversationHistory = [];
  let deepgramConnection = null;
  let currentTranscript = '';
  let isProcessing = false;

  // Connect to Deepgram for live transcription
  async function setupDeepgramConnection() {
    try {
      deepgramConnection = deepgram.listen.live({
        model: 'nova-2',
        language: 'en-US',
        smart_format: true,
        interim_results: true,
        endpointing: 300, // ms of silence before finalizing
        utterance_end_ms: 1000
      });

      deepgramConnection.on('open', () => {
        console.log(`[${sessionId}] ✓ Deepgram connection established`);
        ws.send(JSON.stringify({
          type: 'status',
          message: 'Ready to receive audio'
        }));
      });

      deepgramConnection.on('Results', async (data) => {
        const transcript = data.channel.alternatives[0].transcript;

        if (transcript && transcript.trim().length > 0) {
          const isFinal = data.is_final;

          console.log(`[${sessionId}] 📝 ${isFinal ? 'FINAL' : 'interim'}: "${transcript}"`);

          // Send interim transcript to browser
          ws.send(JSON.stringify({
            type: 'transcript',
            text: transcript,
            isFinal: isFinal
          }));

          // Process final transcript
          if (isFinal && !isProcessing) {
            currentTranscript = transcript;
            await processTranscript(transcript);
          }
        }
      });

      deepgramConnection.on('error', (error) => {
        console.error(`[${sessionId}] ❌ Deepgram error:`, error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Speech recognition error'
        }));
      });

      deepgramConnection.on('close', () => {
        console.log(`[${sessionId}] 🔌 Deepgram connection closed`);
      });

    } catch (error) {
      console.error(`[${sessionId}] Failed to setup Deepgram:`, error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Failed to initialize speech recognition'
      }));
    }
  }

  // Process transcript through OpenAI and generate audio response
  async function processTranscript(transcript) {
    isProcessing = true;

    try {
      console.log(`[${sessionId}] 🤖 Processing with OpenAI...`);

      // Add to conversation history
      conversationHistory.push({
        role: 'user',
        content: transcript
      });

      // Get AI response
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful voice assistant. Keep responses brief and conversational since they will be spoken aloud. Limit responses to 2-3 sentences maximum.'
          },
          ...conversationHistory
        ],
        max_tokens: 150,
        temperature: 0.7
      });

      const aiResponse = completion.choices[0].message.content;
      console.log(`[${sessionId}] 💬 AI: "${aiResponse}"`);

      // Add to conversation history
      conversationHistory.push({
        role: 'assistant',
        content: aiResponse
      });

      // Send text response to browser
      ws.send(JSON.stringify({
        type: 'aiResponse',
        text: aiResponse
      }));

      // Generate audio with ElevenLabs
      await generateAndStreamAudio(aiResponse);

    } catch (error) {
      console.error(`[${sessionId}] ❌ Processing error:`, error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Failed to process your request'
      }));
    } finally {
      isProcessing = false;
    }
  }

  // Generate audio with ElevenLabs and stream to browser
  async function generateAndStreamAudio(text) {
    try {
      console.log(`[${sessionId}] 🎵 Generating audio with ElevenLabs...`);

      const response = await fetch(
        'https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM/stream',
        {
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': elevenlabsApiKey
          },
          body: JSON.stringify({
            text: text,
            model_id: 'eleven_monolingual_v1',
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.5
            }
          })
        }
      );

      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.status}`);
      }

      console.log(`[${sessionId}] ✓ Streaming audio to browser...`);

      // Stream audio chunks to browser
      const reader = response.body.getReader();
      let totalChunks = 0;

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.log(`[${sessionId}] ✓ Audio streaming complete (${totalChunks} chunks)`);

          // Send completion signal
          ws.send(JSON.stringify({
            type: 'audioComplete'
          }));
          break;
        }

        // Send audio chunk to browser
        ws.send(JSON.stringify({
          type: 'audioChunk',
          data: Array.from(value) // Convert Uint8Array to regular array for JSON
        }));

        totalChunks++;
      }

    } catch (error) {
      console.error(`[${sessionId}] ❌ Audio generation error:`, error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Failed to generate audio response'
      }));
    }
  }

  // Setup Deepgram connection when client connects
  setupDeepgramConnection();

  // Handle incoming messages
  ws.on('message', async (data) => {
    try {
      // Check if it's binary audio data
      if (data instanceof Buffer) {
        // Forward raw audio to Deepgram
        if (deepgramConnection && deepgramConnection.getReadyState() === 1) {
          deepgramConnection.send(data);
        }
      } else {
        // Handle JSON control messages
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case 'startAudio':
            console.log(`[${sessionId}] 🎙️ Audio streaming started`);
            break;

          case 'stopAudio':
            console.log(`[${sessionId}] 🛑 Audio streaming stopped`);
            if (deepgramConnection) {
              deepgramConnection.finish();
            }
            break;

          case 'reset':
            console.log(`[${sessionId}] 🔄 Resetting conversation`);
            conversationHistory = [];
            currentTranscript = '';
            ws.send(JSON.stringify({
              type: 'status',
              message: 'Conversation reset'
            }));
            break;

          default:
            console.log(`[${sessionId}] ⚠️ Unknown message type:`, message.type);
        }
      }
    } catch (error) {
      console.error(`[${sessionId}] ❌ Message handling error:`, error);
    }
  });

  ws.on('close', () => {
    console.log(`[${sessionId}] 🔌 WebSocket disconnected`);
    if (deepgramConnection) {
      deepgramConnection.finish();
    }
  });

  ws.on('error', (error) => {
    console.error(`[${sessionId}] ❌ WebSocket error:`, error);
  });
});

httpServer.listen(PORT, () => {
  console.log(`✓ Raw Audio WebSocket server ready!`);
  console.log(`  - WebSocket: ws://localhost:${PORT}`);
  console.log(`  - Health check: http://localhost:${PORT}`);
  console.log(`\n💡 Connection URL format:`);
  console.log(`  ws://localhost:${PORT}?openaiKey=sk-xxx&deepgramKey=xxx&elevenlabsKey=xxx&sessionId=test`);
  console.log(`\n🎙️ This server handles raw audio streaming:`);
  console.log(`  Browser mic → Deepgram STT → OpenAI LLM → ElevenLabs TTS → Browser speaker`);
});
