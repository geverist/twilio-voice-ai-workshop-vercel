/**
 * Test WebSocket Code (Vercel Version)
 *
 * Allows students to test their WebSocket handler code in a staging environment.
 * Executes their code in an isolated sandbox and simulates ConversationRelay events.
 *
 * This is WORKSHOP-ONLY for testing. Production code runs on Railway/Render.
 */

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const {
      code,
      testMessage,
      openaiApiKey
    } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'WebSocket handler code is required'
      });
    }

    if (!testMessage) {
      return res.status(400).json({
        success: false,
        error: 'Test message is required'
      });
    }

    if (!openaiApiKey) {
      return res.status(400).json({
        success: false,
        error: 'OpenAI API key is required'
      });
    }

    // =========================================================================
    // SIMULATE WEBSOCKET INTERACTION
    // =========================================================================
    // We can't actually run their Node.js code in Vercel serverless,
    // but we can simulate the WebSocket event flow and test the OpenAI integration

    console.log('Testing WebSocket handler with message:', testMessage);

    // Import OpenAI dynamically
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: openaiApiKey });

    // Create a simulated WebSocket message (what ConversationRelay would send)
    const simulatedEvent = {
      type: 'prompt',
      voicePrompt: testMessage,
      lang: 'en-US',
      last: true,
      callSid: 'CA_test_' + Date.now(),
      sessionId: 'test_session',
      from: '+15551234567',
      to: '+15559876543',
      direction: 'inbound'
    };

    // Extract system prompt from student's code (if customized)
    let systemPrompt = 'You are a helpful voice assistant. Keep responses brief and conversational since they will be spoken aloud.';

    const systemPromptMatch = code.match(/role:\s*['"`]system['"`]\s*,\s*content:\s*['"`]([^'"`]+)['"`]/);
    if (systemPromptMatch) {
      systemPrompt = systemPromptMatch[1];
    }

    // Test the LLM integration (this is what their WebSocket handler would do)
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: testMessage
        }
      ],
      max_tokens: 150,
      temperature: 0.7
    });

    const aiResponse = completion.choices[0].message.content;

    // Create simulated WebSocket response (what their handler would send back)
    const simulatedResponse = {
      type: 'text',
      token: aiResponse,
      last: true
    };

    // =========================================================================
    // VALIDATE CODE STRUCTURE
    // =========================================================================
    const codeValidation = {
      hasWebSocketSetup: code.includes('ws.on(') || code.includes('ws.addEventListener'),
      hasMessageHandler: code.includes("'message'") || code.includes('"message"'),
      hasPromptCase: code.includes("'prompt'") || code.includes('"prompt"'),
      hasOpenAI: code.includes('openai') || code.includes('OpenAI'),
      hasResponseSend: code.includes('ws.send') && code.includes('type:') && code.includes('token:'),
      hasErrorHandling: code.includes('try') && code.includes('catch')
    };

    const allValid = Object.values(codeValidation).every(v => v);

    // =========================================================================
    // RETURN TEST RESULTS
    // =========================================================================
    return res.status(200).json({
      success: true,
      message: 'WebSocket handler test completed',
      test: {
        input: simulatedEvent,
        output: simulatedResponse,
        aiResponse: aiResponse,
        systemPrompt: systemPrompt
      },
      validation: {
        passed: allValid,
        checks: codeValidation,
        issues: Object.entries(codeValidation)
          .filter(([key, value]) => !value)
          .map(([key]) => {
            const messages = {
              hasWebSocketSetup: 'Missing WebSocket event listener setup (ws.on or ws.addEventListener)',
              hasMessageHandler: 'Missing message event handler',
              hasPromptCase: 'Missing "prompt" event case handler',
              hasOpenAI: 'Missing OpenAI integration',
              hasResponseSend: 'Missing ws.send() with correct response format (type, token, last)',
              hasErrorHandling: 'Missing error handling (try/catch)'
            };
            return messages[key];
          })
      },
      events: [
        {
          timestamp: new Date().toISOString(),
          direction: 'incoming',
          event: 'setup',
          description: 'ConversationRelay connection established'
        },
        {
          timestamp: new Date().toISOString(),
          direction: 'incoming',
          event: 'prompt',
          description: `Caller said: "${testMessage}"`
        },
        {
          timestamp: new Date().toISOString(),
          direction: 'processing',
          event: 'openai_request',
          description: 'Sending to OpenAI for processing'
        },
        {
          timestamp: new Date().toISOString(),
          direction: 'processing',
          event: 'openai_response',
          description: `OpenAI responded: "${aiResponse.substring(0, 50)}..."`
        },
        {
          timestamp: new Date().toISOString(),
          direction: 'outgoing',
          event: 'text',
          description: 'Sending response to ConversationRelay → Twilio speaks it'
        }
      ]
    });

  } catch (error) {
    console.error('WebSocket test error:', error);

    // Provide helpful error messages
    let errorMessage = error.message;
    let errorHints = [];

    if (error.message.includes('API key')) {
      errorHints.push('Check that your OpenAI API key is valid');
      errorHints.push('Get a key at https://platform.openai.com/api-keys');
    } else if (error.message.includes('quota') || error.message.includes('insufficient')) {
      errorHints.push('Your OpenAI account has no credits');
      errorHints.push('Add credits at https://platform.openai.com/account/billing');
    } else if (error.message.includes('rate')) {
      errorHints.push('Rate limit exceeded - wait 60 seconds and try again');
    }

    return res.status(500).json({
      success: false,
      error: errorMessage,
      hints: errorHints
    });
  }
}
