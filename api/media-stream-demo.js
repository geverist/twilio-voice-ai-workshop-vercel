/**
 * Media Streams Demo WebSocket Handler (Vercel Edge Runtime)
 *
 * This demonstrates how Twilio Media Streams work - the foundation of ConversationRelay.
 * Runs on Vercel Edge runtime with WebSocket support.
 */

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  // Handle WebSocket upgrade
  if (req.headers.get('upgrade') === 'websocket') {
    const upgradeHeader = req.headers.get('upgrade');
    const { socket, response } = Deno.upgradeWebSocket(req);

    const sessionId = `session_${Date.now()}`;
    console.log(`[${sessionId}] 🎙️ Media stream connected`);

    let audioChunksReceived = 0;
    let firstChunkTime = null;
    let utteranceCount = 0;
    let silenceDetected = false;

    socket.onopen = () => {
      console.log(`[${sessionId}] ✓ WebSocket opened`);
      socket.send(JSON.stringify({
        type: 'connected',
        message: 'Media Streams Demo - Ready to receive audio',
        info: 'This is how Twilio Media Streams work!'
      }));
    };

    socket.onmessage = async (event) => {
      // Check if it's binary audio data
      if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
        audioChunksReceived++;
        const now = Date.now();

        if (!firstChunkTime) {
          firstChunkTime = now;
          utteranceCount++;
          console.log(`[${sessionId}] 📊 Utterance #${utteranceCount} started - receiving audio stream...`);

          // Notify browser that utterance started
          socket.send(JSON.stringify({
            type: 'utteranceStart',
            utteranceNumber: utteranceCount,
            timestamp: new Date().toISOString()
          }));
        }

        // Update progress every 50 chunks
        if (audioChunksReceived % 50 === 0) {
          const duration = ((now - firstChunkTime) / 1000).toFixed(1);
          socket.send(JSON.stringify({
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
          socket.send(JSON.stringify({
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
          socket.send(JSON.stringify({
            type: 'aiResponse',
            utteranceNumber: utteranceCount,
            text: aiResponse
          }));

          console.log(`[${sessionId}] 💬 AI Response sent for utterance #${utteranceCount}`);

          // Simulate TTS audio generation delay
          await new Promise(resolve => setTimeout(resolve, 200));

          // Send instruction to browser to speak the response
          socket.send(JSON.stringify({
            type: 'speak',
            text: aiResponse
          }));

          // Reset for next utterance
          audioChunksReceived = 0;
          firstChunkTime = null;
          silenceDetected = false;
        }

      } else {
        // Handle JSON control messages
        try {
          const message = JSON.parse(event.data);

          switch (message.type) {
            case 'start':
              console.log(`[${sessionId}] ▶️  Stream started`);
              socket.send(JSON.stringify({
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
    };

    socket.onclose = () => {
      console.log(`[${sessionId}] 🔌 Media stream disconnected`);
      if (audioChunksReceived > 0) {
        console.log(`[${sessionId}] 📊 Session stats: ${audioChunksReceived} audio chunks received`);
      }
    };

    socket.onerror = (error) => {
      console.error(`[${sessionId}] ❌ WebSocket error:`, error);
    };

    return response;
  }

  // Handle regular HTTP requests (health check)
  return new Response(JSON.stringify({
    status: 'running',
    message: 'Media Streams Demo Server',
    websocketUrl: `wss://${req.headers.get('host')}/api/media-stream-demo`,
    info: 'This demonstrates how Twilio Media Streams work'
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

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
