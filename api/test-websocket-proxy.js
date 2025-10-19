/**
 * WebSocket Test Proxy
 * Tests student Codespace WebSocket from server-side (bypasses browser auth issues)
 */

import WebSocket from 'ws';

export default async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { websocketUrl, githubToken } = req.body;

  if (!websocketUrl) {
    return res.status(400).json({ error: 'websocketUrl is required' });
  }

  if (!githubToken) {
    return res.status(400).json({ error: 'githubToken is required for Codespace authentication' });
  }

  const testResults = [];
  const startTime = Date.now();

  try {
    testResults.push({ type: 'info', message: `Connecting to ${websocketUrl}...`, timestamp: Date.now() - startTime });

    // Add GitHub authentication header for Codespace access
    const ws = new WebSocket(websocketUrl, {
      headers: {
        'Cookie': `_gh_sess=${githubToken}`,
        'User-Agent': 'Twilio-Workshop-Test/1.0'
      }
    });
    let connectionSuccessful = false;
    let receivedMessages = [];

    // Set timeout
    const timeout = setTimeout(() => {
      if (!connectionSuccessful) {
        ws.close();
      }
    }, 10000); // 10 second timeout

    ws.on('open', () => {
      connectionSuccessful = true;
      testResults.push({ type: 'success', message: '✅ WebSocket connected successfully!', timestamp: Date.now() - startTime });

      // Send test "connected" event (Twilio format)
      testResults.push({ type: 'info', message: 'Sending "connected" event...', timestamp: Date.now() - startTime });
      ws.send(JSON.stringify({
        event: 'connected',
        protocol: 'Call',
        version: '1.0.0'
      }));

      // Send test "start" event
      setTimeout(() => {
        testResults.push({ type: 'info', message: 'Sending "start" event...', timestamp: Date.now() - startTime });
        ws.send(JSON.stringify({
          event: 'start',
          sequenceNumber: '1',
          start: {
            streamSid: 'test-stream-' + Date.now(),
            accountSid: 'ACtest',
            callSid: 'CAtest',
            tracks: ['inbound'],
            mediaFormat: {
              encoding: 'audio/x-mulaw',
              sampleRate: 8000,
              channels: 1
            }
          },
          streamSid: 'test-stream-' + Date.now()
        }));
      }, 100);

      // Close after receiving responses
      setTimeout(() => {
        testResults.push({ type: 'info', message: 'Test complete, closing connection...', timestamp: Date.now() - startTime });
        ws.close();
        clearTimeout(timeout);
      }, 2000);
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        receivedMessages.push(message);
        testResults.push({
          type: 'success',
          message: `📥 Received response from server`,
          data: message,
          timestamp: Date.now() - startTime
        });
      } catch (e) {
        testResults.push({
          type: 'warning',
          message: `Received non-JSON message: ${data.toString().substring(0, 100)}`,
          timestamp: Date.now() - startTime
        });
      }
    });

    ws.on('error', (error) => {
      testResults.push({
        type: 'error',
        message: `WebSocket error: ${error.message}`,
        timestamp: Date.now() - startTime
      });
      clearTimeout(timeout);
    });

    ws.on('close', (code, reason) => {
      testResults.push({
        type: 'info',
        message: `Connection closed (code: ${code}, reason: ${reason || 'none'})`,
        timestamp: Date.now() - startTime
      });

      clearTimeout(timeout);

      // Return results
      return res.status(200).json({
        success: connectionSuccessful,
        results: testResults,
        receivedMessages,
        duration: Date.now() - startTime
      });
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      results: testResults
    });
  }
};
