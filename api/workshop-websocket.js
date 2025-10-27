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

  // Store conversation history (in-memory for this call)
  const conversationHistory = [];

  // Track conversation session ID for database persistence
  let conversationSessionId = null;
  let turnCounter = 0;

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

          // Create conversation session in database (if sessionToken exists)
          if (sessionToken) {
            try {
              const createSessionResponse = await fetch(
                `https://${process.env.VERCEL_URL || 'localhost:3000'}/api/conversation-session-create`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    sessionToken,
                    callSid: data.callSid,
                    fromNumber: data.from,
                    toNumber: data.to,
                    direction: data.direction
                  })
                }
              );

              if (createSessionResponse.ok) {
                const result = await createSessionResponse.json();
                if (result.success) {
                  conversationSessionId = result.conversationSessionId;
                  console.log(`[${sessionId}] ✅ Created conversation session: ${conversationSessionId}`);
                }
              }
            } catch (error) {
              console.warn(`[${sessionId}] Failed to create conversation session:`, error.message);
            }
          }
          break;

        // Prompt event - caller spoke
        case 'prompt':
          console.log(`[${sessionId}] Caller said:`, data.voicePrompt);

          // Increment turn counter
          turnCounter++;

          // Add to conversation history
          conversationHistory.push({
            role: 'user',
            content: data.voicePrompt
          });

          // Save user message to database
          if (conversationSessionId) {
            try {
              await fetch(
                `https://${process.env.VERCEL_URL || 'localhost:3000'}/api/conversation-history-add`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    conversationSessionId,
                    turnNumber: turnCounter,
                    role: 'user',
                    content: data.voicePrompt
                  })
                }
              );
            } catch (error) {
              console.warn(`[${sessionId}] Failed to save user message:`, error.message);
            }
          }

          try {
            // Call OpenAI with student's custom system prompt and tools
            const completionParams = {
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
            };

            // Add tools if configured
            if (studentSettings.tools && studentSettings.tools.length > 0) {
              completionParams.tools = studentSettings.tools;
              completionParams.tool_choice = 'auto';
            }

            const completion = await openai.chat.completions.create(completionParams);

            const message = completion.choices[0].message;

            // Check if AI wants to call a tool
            if (message.tool_calls && message.tool_calls.length > 0) {
              console.log(`[${sessionId}] AI requested tool calls:`, message.tool_calls.length);

              // Add assistant message with tool calls to history
              conversationHistory.push({
                role: 'assistant',
                content: message.content,
                tool_calls: message.tool_calls
              });

              // Execute each tool call
              const toolResults = [];
              for (const toolCall of message.tool_calls) {
                const toolName = toolCall.function.name;
                const toolArgs = JSON.parse(toolCall.function.arguments);

                console.log(`[${sessionId}] Executing tool: ${toolName}`, toolArgs);

                // Find tool configuration
                const toolConfig = studentSettings.tools.find(
                  t => t.type === 'function' && t.function?.name === toolName
                );

                let toolResult = null;

                // Check if tool has a webhook URL
                if (toolConfig?.function?.webhook_url) {
                  try {
                    const webhookResponse = await fetch(toolConfig.function.webhook_url, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        tool: toolName,
                        arguments: toolArgs,
                        sessionToken,
                        conversationSessionId
                      })
                    });

                    if (webhookResponse.ok) {
                      toolResult = await webhookResponse.json();
                      console.log(`[${sessionId}] Tool webhook success:`, toolName);
                    } else {
                      toolResult = { error: `Webhook returned status ${webhookResponse.status}` };
                      console.error(`[${sessionId}] Tool webhook failed:`, webhookResponse.status);
                    }
                  } catch (webhookError) {
                    console.error(`[${sessionId}] Tool webhook error:`, webhookError.message);
                    toolResult = { error: webhookError.message };
                  }
                } else {
                  // Simulated tool execution (for tools without webhooks)
                  toolResult = {
                    success: true,
                    message: `Tool ${toolName} executed successfully (no webhook configured)`
                  };
                }

                toolResults.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  name: toolName,
                  content: JSON.stringify(toolResult)
                });
              }

              // Add tool results to conversation history
              conversationHistory.push(...toolResults);

              // Call OpenAI again with tool results
              const followUpCompletion = await openai.chat.completions.create({
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

              const aiResponse = followUpCompletion.choices[0].message.content;
              console.log(`[${sessionId}] AI response (after tools):`, aiResponse);

              // Continue with normal flow...
              conversationHistory.push({
                role: 'assistant',
                content: aiResponse
              });

              // Save assistant message
              turnCounter++;
              if (conversationSessionId) {
                try {
                  await fetch(
                    `https://${process.env.VERCEL_URL || 'localhost:3000'}/api/conversation-history-add`,
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        conversationSessionId,
                        turnNumber: turnCounter,
                        role: 'assistant',
                        content: aiResponse,
                        metadata: { toolCalls: message.tool_calls.map(tc => tc.function.name) }
                      })
                    }
                  );
                } catch (error) {
                  console.warn(`[${sessionId}] Failed to save assistant message:`, error.message);
                }
              }

              ws.send(JSON.stringify({
                type: 'text',
                token: aiResponse,
                last: true
              }));

              return; // Exit early since we handled the tool call flow
            }

            // No tool calls - normal response
            const aiResponse = message.content;
            console.log(`[${sessionId}] AI response:`, aiResponse);

            // Add to conversation history
            conversationHistory.push({
              role: 'assistant',
              content: aiResponse
            });

            // Increment turn counter for assistant response
            turnCounter++;

            // Save assistant message to database
            if (conversationSessionId) {
              try {
                await fetch(
                  `https://${process.env.VERCEL_URL || 'localhost:3000'}/api/conversation-history-add`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      conversationSessionId,
                      turnNumber: turnCounter,
                      role: 'assistant',
                      content: aiResponse
                    })
                  }
                );
              } catch (error) {
                console.warn(`[${sessionId}] Failed to save assistant message:`, error.message);
              }
            }

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

  ws.addEventListener('close', async () => {
    console.log(`[${sessionId}] WebSocket closed`);

    // End conversation session in database
    if (conversationSessionId) {
      try {
        await fetch(
          `https://${process.env.VERCEL_URL || 'localhost:3000'}/api/conversation-session-end`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conversationSessionId,
              turnCount: Math.floor(turnCounter / 2) // Divide by 2 since we count user + assistant as 1 turn pair
            })
          }
        );
        console.log(`[${sessionId}] ✅ Ended conversation session: ${conversationSessionId}`);
      } catch (error) {
        console.warn(`[${sessionId}] Failed to end conversation session:`, error.message);
      }
    }
  });

  ws.addEventListener('error', (error) => {
    console.error(`[${sessionId}] WebSocket error:`, error);
  });
}
