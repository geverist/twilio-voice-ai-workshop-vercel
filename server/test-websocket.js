/**
 * Quick WebSocket Test Script
 *
 * Tests the local WebSocket server with a simulated ConversationRelay message.
 * Run with: node server/test-websocket.js YOUR_OPENAI_API_KEY
 */

import WebSocket from 'ws';

const apiKey = process.argv[2];

if (!apiKey) {
  console.error('❌ Please provide your OpenAI API key as an argument');
  console.error('Usage: node server/test-websocket.js sk-xxxxx');
  process.exit(1);
}

console.log('🧪 Testing WebSocket server...\n');

const ws = new WebSocket(`ws://localhost:8080?apiKey=${apiKey}&sessionId=test`);

ws.on('open', () => {
  console.log('✓ Connected to WebSocket server');

  // Send a test prompt event (simulating ConversationRelay)
  const testMessage = {
    type: 'prompt',
    voicePrompt: 'Hello, how are you today?',
    lang: 'en-US',
    last: true,
    callSid: 'CA_test_123',
    sessionId: 'test_session',
    from: '+15551234567',
    to: '+15559876543',
    direction: 'inbound'
  };

  console.log('📤 Sending test prompt:', testMessage.voicePrompt);
  ws.send(JSON.stringify(testMessage));
});

ws.on('message', (data) => {
  const response = JSON.parse(data.toString());
  console.log('\n📥 Received response from AI:');
  console.log('   Type:', response.type);
  console.log('   Content:', response.token);
  console.log('   Last:', response.last);

  // Close after receiving response
  setTimeout(() => {
    console.log('\n✓ Test completed successfully!');
    ws.close();
    process.exit(0);
  }, 1000);
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  process.exit(1);
});

ws.on('close', () => {
  console.log('🔌 Disconnected from WebSocket server');
});
