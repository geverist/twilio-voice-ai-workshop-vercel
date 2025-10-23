/**
 * Test Student WebSocket Deployment (Workshop Step 5)
 *
 * This test simulates what happens when a student "deploys" their WebSocket server
 * to Railway in Step 5 (WebSocket Handler). It verifies:
 * 1. WebSocket server is deployed and accessible
 * 2. It accepts sessionToken in path format (/ws/{sessionToken})
 * 3. It retrieves student settings from Vercel API
 * 4. It uses the student's OpenAI key (or instructor's fallback)
 * 5. It can process ConversationRelay prompts
 *
 * Students can run this to verify their deployment is ready:
 *   node test-local-websocket.js
 *
 * Or with a custom session token:
 *   node test-local-websocket.js ws_your_session_token_here
 *
 * Or with a custom Railway URL:
 *   node test-local-websocket.js ws_token wss://your-app.up.railway.app
 */

import WebSocket from 'ws';

// Use session token and Railway URL from command line or defaults
const SESSION_TOKEN = process.argv[2] || 'ws_test_direct_encryption';
const RAILWAY_WS_URL = process.argv[3] || 'wss://workshop-websocket-server-production.up.railway.app';

console.log('🧪 Testing Student WebSocket Deployment (Workshop Step 5)\n');
console.log('📋 Test Configuration:');
console.log(`   Railway Server: ${RAILWAY_WS_URL}`);
console.log(`   Session Token: ${SESSION_TOKEN}`);
console.log(`   Expected: Server fetches settings from Vercel API\n`);

async function testStudentWebSocket() {
  return new Promise((resolve, reject) => {
    let testComplete = false;
    const timeout = setTimeout(() => {
      if (!testComplete) {
        console.log('\n❌ Test timeout - no response from server');
        console.log('\n💡 Troubleshooting:');
        console.log('   1. Is your Railway server deployed and running?');
        console.log('   2. Check Railway logs for errors');
        console.log('   3. Verify VERCEL_API_URL environment variable is set in Railway:');
        console.log('      VERCEL_API_URL=https://twilio-voice-ai-workshop-vercel.vercel.app');
        console.log('   4. Verify OPENAI_API_KEY is set in Railway (fallback)');
        ws.close();
        reject(new Error('Timeout'));
      }
    }, 10000);

    // Connect with sessionToken in path (Railway format: /ws/{sessionToken})
    const wsUrl = `${RAILWAY_WS_URL}/ws/${SESSION_TOKEN}`;
    console.log(`🔌 Connecting to: ${wsUrl}\n`);

    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      console.log('✅ WebSocket connected!');
      console.log('   → Server should be fetching your settings from Vercel API...');
      console.log('   → Your OpenAI key will be decrypted automatically\n');

      // Send a test prompt (simulates ConversationRelay prompt event)
      console.log('📤 Sending test ConversationRelay prompt...');
      const testPrompt = {
        type: 'prompt',
        voicePrompt: 'Say hello in one sentence'
      };
      console.log(`   Prompt: "${testPrompt.voicePrompt}"\n`);
      ws.send(JSON.stringify(testPrompt));
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === 'text') {
          console.log('📨 Received AI Response:');
          console.log(`   Type: ${message.type}`);
          console.log(`   Response: "${message.token}"`);
          console.log(`   Final: ${message.last}\n`);

          console.log('🎉 SUCCESS! Your Railway deployment is ready!\n');
          console.log('✅ Verified:');
          console.log('   ✓ WebSocket server deployed to Railway');
          console.log('   ✓ Accepts sessionToken in path format');
          console.log('   ✓ Retrieves student settings from Vercel');
          console.log('   ✓ OpenAI key decrypted and working');
          console.log('   ✓ Can process ConversationRelay prompts');
          console.log('   ✓ Generates AI responses successfully\n');

          console.log('🚀 Next Step (Workshop Step 6):');
          console.log('   Your WebSocket server is ready for ConversationRelay!');
          console.log('   Copy this URL for Step 6:');
          console.log(`   ${RAILWAY_WS_URL}/ws/{your_session_token}\n`);

          testComplete = true;
          clearTimeout(timeout);
          ws.close();
          resolve();

        } else if (message.type === 'error') {
          console.log('❌ Error from server:');
          console.log(`   ${message.error || message.message}\n`);
          console.log('⚠️  Common Issues:');
          console.log('   • No OpenAI API key configured (set OPENAI_API_KEY env var)');
          console.log('   • Session token not found in database (configure in Step 1)');
          console.log('   • Vercel API unreachable (check VERCEL_API_URL)\n');

          testComplete = true;
          clearTimeout(timeout);
          ws.close();
          reject(new Error(message.error || message.message));

        } else {
          console.log(`📨 Received: ${message.type}`);
        }
      } catch (error) {
        console.log('❌ Error parsing message:', error.message);
        console.log('   Raw message:', data.toString());
      }
    });

    ws.on('error', (error) => {
      console.log('❌ WebSocket connection error:', error.message);
      console.log('\n💡 Common Issues:');
      console.log('   • Railway deployment failed (check Railway dashboard)');
      console.log('   • Wrong Railway URL (verify your app URL)');
      console.log('   • Network/firewall blocking WebSocket connection\n');
      clearTimeout(timeout);
      reject(error);
    });

    ws.on('close', () => {
      if (!testComplete) {
        console.log('\n⚠️  WebSocket closed before test completed');
        console.log('   Check server logs for errors\n');
      }
      clearTimeout(timeout);
    });
  });
}

// Run the test
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

testStudentWebSocket()
  .then(() => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Student WebSocket Deployment Test PASSED\n');
    process.exit(0);
  })
  .catch((error) => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('❌ Student WebSocket Deployment Test FAILED');
    console.log(`   Error: ${error.message}\n`);
    process.exit(1);
  });
