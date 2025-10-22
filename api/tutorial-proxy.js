/**
 * Twilio API Proxy for Interactive Tutorial (Vercel Version)
 *
 * This function safely proxies Twilio API calls from the tutorial frontend
 * Users provide their own Account SID and Auth Token
 */

import twilio from 'twilio';
import { applyCORS, handlePreflightRequest } from './_lib/cors.js';
import { applyRateLimit } from './_lib/ratelimit.js';
import {
  validateString,
  validateEnum,
  validateTwilioSID,
  validatePhoneNumber,
  handleValidationError
} from './_lib/validation.js';

const ALLOWED_ACTIONS = [
  'getOAuthConfig',
  'listPhoneNumbers',
  'makeCall',
  'getCall',
  'validateCredentials',
  'provisionPhoneNumber',
  'createMessagingService',
  'addNumberToMessagingService',
  'createSyncService',
  'checkConversationalIntelligence',
  'createCIService',
  'listMessagingServices',
  'listSyncServices',
  'setupComplete',
  'testOpenAI',
  'updatePhoneNumber',
  'getWorkshopCallHistory'
];

export default async function handler(req, res) {
  // Apply CORS
  applyCORS(req, res);

  // Handle preflight
  if (handlePreflightRequest(req, res)) {
    return;
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Apply rate limiting (10 requests per 10 seconds per IP)
  const allowed = await applyRateLimit(req, res);
  if (!allowed) {
    return; // Response already sent by rate limiter
  }

  try {
    const { action, accountSid, authToken, apiKey, ...params } = req.body;

    // Validate action
    try {
      if (action) {
        validateEnum(action, 'action', ALLOWED_ACTIONS);
      }
    } catch (validationError) {
      return handleValidationError(validationError, res);
    }

    // Special case: getOAuthConfig doesn't need accountSid/authToken
    if (action === 'getOAuthConfig') {
      try {
        // Return OAuth Client ID (NOT secret!) for frontend to initiate OAuth
        const clientId = process.env.TWILIO_OAUTH_CLIENT_ID;

        if (!clientId) {
          return res.status(400).json({
            success: false,
            error: 'OAuth not configured. Please set TWILIO_OAUTH_CLIENT_ID in environment variables.'
          });
        }

        return res.status(200).json({
          success: true,
          clientId: clientId
          // NEVER return clientSecret!
        });
      } catch (error) {
        console.error('getOAuthConfig error:', error);
        return res.status(500).json({
          success: false,
          error: `Failed to get OAuth config: ${error.message}`
        });
      }
    }

    // Special case: testOpenAI doesn't need Twilio credentials
    if (action === 'testOpenAI') {
      const { message, openaiApiKey, systemPrompt, demoMode } = params;

      if (!message) {
        return res.status(400).json({
          success: false,
          error: 'Message is required for OpenAI test'
        });
      }

      // Demo mode simulation
      if (demoMode === true) {
        // Simulate AI response without calling OpenAI
        const demoResponses = [
          "Hello! This is a simulated AI response in demo mode.",
          "I'm functioning perfectly! This is demo mode, so no actual API calls are made.",
          "That's a great question! In a real scenario, I'd be powered by OpenAI.",
          "Demo mode allows you to test the workshop flow without using API credits.",
          "Everything looks good! This response is simulated for demo purposes."
        ];

        const randomResponse = demoResponses[Math.floor(Math.random() * demoResponses.length)];

        return res.status(200).json({
          success: true,
          response: randomResponse,
          model: 'demo-mode',
          note: 'This is a simulated response (demo mode)'
        });
      }

      // Real OpenAI API call
      if (!openaiApiKey) {
        return res.status(400).json({
          success: false,
          error: 'OpenAI API key is required'
        });
      }

      try {
        // Make request to OpenAI API
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiApiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: systemPrompt || 'You are a helpful voice assistant. Keep responses brief and conversational since they will be spoken aloud.'
              },
              {
                role: 'user',
                content: message
              }
            ],
            max_tokens: 150
          })
        });

        if (!openaiResponse.ok) {
          const errorData = await openaiResponse.json();
          throw new Error(errorData.error?.message || `OpenAI API error: ${openaiResponse.status}`);
        }

        const openaiData = await openaiResponse.json();
        const aiResponse = openaiData.choices[0]?.message?.content || 'No response generated';

        return res.status(200).json({
          success: true,
          response: aiResponse,
          model: openaiData.model,
          usage: openaiData.usage
        });
      } catch (openaiError) {
        console.error('OpenAI API Error:', openaiError);
        return res.status(500).json({
          success: false,
          error: openaiError.message
        });
      }
    }

    // Validate required params for other actions
    if (!action || !accountSid || !authToken) {
      return res.status(400).json({
        error: 'Missing required parameters: action, accountSid, authToken'
      });
    }

    // Validate credentials format
    try {
      validateTwilioSID(accountSid, 'accountSid', 'AC');
      validateString(authToken, 'authToken', { minLength: 32, maxLength: 64 });

      if (apiKey) {
        validateTwilioSID(apiKey, 'apiKey', 'SK');
      }

      // Validate phone numbers in params
      if (params.to) {
        validatePhoneNumber(params.to, 'to');
      }
      if (params.from) {
        validatePhoneNumber(params.from, 'from');
      }
      if (params.phoneNumber) {
        validatePhoneNumber(params.phoneNumber, 'phoneNumber');
      }

      // Validate SIDs in params
      if (params.callSid) {
        validateTwilioSID(params.callSid, 'callSid', 'CA');
      }
      if (params.phoneNumberSid) {
        validateTwilioSID(params.phoneNumberSid, 'phoneNumberSid', 'PN');
      }
      if (params.serviceSid) {
        validateTwilioSID(params.serviceSid, 'serviceSid', 'MG');
      }

      // Validate URLs in params
      if (params.url) {
        validateString(params.url, 'url', { maxLength: 2048 });
      }
      if (params.voiceUrl) {
        validateString(params.voiceUrl, 'voiceUrl', { maxLength: 2048 });
      }
      if (params.statusCallback) {
        validateString(params.statusCallback, 'statusCallback', { maxLength: 2048 });
      }

      // Validate strings
      if (params.message) {
        validateString(params.message, 'message', { maxLength: 5000 });
      }
      if (params.friendlyName) {
        validateString(params.friendlyName, 'friendlyName', { maxLength: 200 });
      }
    } catch (validationError) {
      return handleValidationError(validationError, res);
    }

    // Initialize Twilio client with user's credentials
    // Support both API Key and Auth Token authentication
    let client;
    if (apiKey) {
      // API Key authentication: use API Key SID as username, API Key Secret as password
      client = twilio(apiKey, authToken, { accountSid });
    } else {
      // Standard authentication: use Account SID and Auth Token
      client = twilio(accountSid, authToken);
    }

    let result;

    switch (action) {
      case 'listPhoneNumbers':
        // Fetch user's phone numbers
        const phoneNumbersList = await client.incomingPhoneNumbers.list({ limit: 50 });
        result = {
          success: true,
          phoneNumbers: phoneNumbersList.map(num => ({
            sid: num.sid,
            phoneNumber: num.phoneNumber,
            friendlyName: num.friendlyName,
            capabilities: num.capabilities
          }))
        };
        break;

      case 'makeCall':
        // Make an outbound call
        // Accept pre-generated TwiML or declarative config (no code execution)
        let twimlResponse;

        if (params.ivrTwiml) {
          // SECURITY FIX: Accept pre-generated TwiML XML instead of executing code
          // Validate that it's valid TwiML XML
          const VoiceResponse = twilio.twiml.VoiceResponse;

          try {
            // If it looks like XML (starts with <), treat as TwiML
            if (typeof params.ivrTwiml === 'string' && params.ivrTwiml.trim().startsWith('<')) {
              // Validate TwiML by attempting to parse
              const xmlCheck = params.ivrTwiml.trim();
              if (xmlCheck.includes('<Response>') || xmlCheck.includes('<response>')) {
                twimlResponse = xmlCheck;
              } else {
                throw new Error('Invalid TwiML: must contain <Response> element');
              }
            } else {
              // Treat as declarative config object for safety
              // Example: { say: "Hello world", voice: "alice" }
              const config = typeof params.ivrTwiml === 'string' ?
                JSON.parse(params.ivrTwiml) : params.ivrTwiml;

              const twiml = new VoiceResponse();

              if (config.say) {
                const sayOptions = {};
                if (config.voice) sayOptions.voice = config.voice;
                if (config.language) sayOptions.language = config.language;
                twiml.say(sayOptions, config.say);
              }

              if (config.gather) {
                const gather = twiml.gather({
                  input: config.gather.input || 'speech dtmf',
                  action: config.gather.action,
                  method: config.gather.method || 'POST'
                });
                if (config.gather.say) {
                  gather.say(config.gather.say);
                }
              }

              if (config.dial) {
                twiml.dial({}, config.dial);
              }

              twimlResponse = twiml.toString();
            }
          } catch (error) {
            console.error('Error processing TwiML:', error);
            const fallbackTwiml = new VoiceResponse();
            fallbackTwiml.say('There was an error with your TwiML configuration.');
            twimlResponse = fallbackTwiml.toString();
          }
        } else if (params.dialTarget) {
          // Generate Dial TwiML inline
          const VoiceResponse = twilio.twiml.VoiceResponse;
          const twiml = new VoiceResponse();
          const dialOptions = {};

          if (params.timeout) dialOptions.timeout = parseInt(params.timeout);
          if (params.machineDetection) dialOptions.machineDetection = params.machineDetection;

          const dial = twiml.dial(dialOptions);
          dial.number(params.dialTarget);
          twimlResponse = twiml.toString();
        }

        const callParams = {
          to: params.to,
          from: params.from,
          statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
        };

        // Use either TwiML inline or URL
        if (twimlResponse) {
          callParams.twiml = twimlResponse;
        } else if (params.url) {
          callParams.url = params.url;
          if (params.machineDetection) {
            callParams.machineDetection = params.machineDetection;
          }
        }

        if (params.statusCallback) {
          callParams.statusCallback = params.statusCallback;
        }

        const call = await client.calls.create(callParams);

        result = {
          success: true,
          callSid: call.sid,
          status: call.status,
          to: call.to,
          from: call.from
        };
        break;

      case 'getCall':
        // Get call details
        const callInfo = await client.calls(params.callSid).fetch();
        result = {
          success: true,
          call: {
            sid: callInfo.sid,
            status: callInfo.status,
            duration: callInfo.duration,
            to: callInfo.to,
            from: callInfo.from,
            startTime: callInfo.startTime,
            endTime: callInfo.endTime
          }
        };
        break;

      case 'validateCredentials':
        // Validate credentials by making a simple API call
        // For API Keys, we can't always fetch account details, so we'll list phone numbers instead
        try {
          // Try to list phone numbers as a validation test
          await client.incomingPhoneNumbers.list({ limit: 1 });

          // If that succeeds, try to get account info (might not work with API Keys)
          let accountInfo = { sid: accountSid, friendlyName: 'Connected', status: 'active' };
          try {
            const account = await client.api.accounts(accountSid).fetch();
            accountInfo = {
              sid: account.sid,
              friendlyName: account.friendlyName,
              status: account.status
            };
          } catch (accountError) {
            // API Key might not have permission to fetch account - that's okay
            console.log('Could not fetch account details (normal for API Keys):', accountError.message);
          }

          result = {
            success: true,
            account: accountInfo
          };
        } catch (validationError) {
          throw validationError;
        }
        break;

      case 'provisionPhoneNumber':
        // Search and purchase available phone number
        const { areaCode, countryCode } = params;

        // Search for available numbers
        const availableNumbers = await client.availablePhoneNumbers(countryCode || 'US')
          .local
          .list({
            areaCode: areaCode,
            voiceEnabled: true,
            limit: 5
          });

        if (availableNumbers.length === 0) {
          result = { success: false, error: 'No available numbers found in this area' };
          break;
        }

        // Purchase the first available number
        const purchasedNumber = await client.incomingPhoneNumbers.create({
          phoneNumber: availableNumbers[0].phoneNumber,
          voiceUrl: params.voiceUrl || 'https://demo.twilio.com/welcome/voice/',
          friendlyName: params.friendlyName || 'Tutorial Number'
        });

        result = {
          success: true,
          phoneNumber: {
            sid: purchasedNumber.sid,
            phoneNumber: purchasedNumber.phoneNumber,
            friendlyName: purchasedNumber.friendlyName
          }
        };
        break;

      case 'createMessagingService':
        // Create a messaging service
        const messagingService = await client.messaging.v1.services.create({
          friendlyName: params.friendlyName || 'Tutorial Messaging Service'
        });

        result = {
          success: true,
          service: {
            sid: messagingService.sid,
            friendlyName: messagingService.friendlyName
          }
        };
        break;

      case 'addNumberToMessagingService':
        // Add phone number to messaging service
        await client.messaging.v1
          .services(params.serviceSid)
          .phoneNumbers
          .create({ phoneNumberSid: params.phoneNumberSid });

        result = {
          success: true,
          message: 'Phone number added to messaging service'
        };
        break;

      case 'createSyncService':
        // Create Sync service for conversation storage
        const syncService = await client.sync.v1.services.create({
          friendlyName: params.friendlyName || 'Tutorial Sync Service'
        });

        result = {
          success: true,
          service: {
            sid: syncService.sid,
            friendlyName: syncService.friendlyName
          }
        };
        break;

      case 'createCIService':
        // Create a Conversational Intelligence service
        try {
          const { uniqueName, friendlyName, autoTranscribe, languageCode } = params;

          // Create CI service
          const ciService = await client.intelligence.v2.services.create({
            uniqueName: uniqueName || `workshop-${Date.now()}`,
            friendlyName: friendlyName || 'Workshop Conversational Intelligence',
            autoTranscribe: autoTranscribe !== false, // Default to true
            languageCode: languageCode || 'en-US',
            autoRedaction: false // Optional: enable PII redaction
          });

          result = {
            success: true,
            serviceSid: ciService.sid,
            uniqueName: ciService.uniqueName,
            friendlyName: ciService.friendlyName,
            message: 'Conversational Intelligence service created successfully'
          };
        } catch (ciError) {
          console.error('Error creating CI service:', ciError);

          // Check if CI is not enabled on account
          if (ciError.code === 20404 || ciError.message.includes('not found') || ciError.message.includes('not available')) {
            result = {
              success: false,
              error: 'Conversational Intelligence is not enabled on your Twilio account. Contact Twilio Sales to enable it.',
              upgradeUrl: 'https://www.twilio.com/docs/voice/intelligence'
            };
          } else {
            result = {
              success: false,
              error: ciError.message || 'Failed to create Conversational Intelligence service'
            };
          }
        }
        break;

      case 'checkConversationalIntelligence':
        // Check if Conversational Intelligence is available
        // CI is enabled at account level, check by trying to access it
        try {
          const intelligence = await client.intelligence.v2.transcripts.list({ limit: 1 });
          result = {
            success: true,
            available: true,
            message: 'Conversational Intelligence is available'
          };
        } catch (error) {
          result = {
            success: true,
            available: false,
            message: 'Conversational Intelligence not available. Contact Twilio Sales to enable.',
            upgradeUrl: 'https://www.twilio.com/docs/voice/intelligence'
          };
        }
        break;

      case 'listMessagingServices':
        // List existing messaging services
        const services = await client.messaging.v1.services.list({ limit: 50 });
        result = {
          success: true,
          services: services.map(s => ({
            sid: s.sid,
            friendlyName: s.friendlyName
          }))
        };
        break;

      case 'listSyncServices':
        // List existing Sync services
        const syncServices = await client.sync.v1.services.list({ limit: 50 });
        result = {
          success: true,
          services: syncServices.map(s => ({
            sid: s.sid,
            uniqueName: s.uniqueName,
            friendlyName: s.friendlyName
          }))
        };
        break;

      case 'setupComplete':
        // Check all required services and return status
        const setupStatus = {
          phoneNumbers: [],
          messagingService: null,
          syncService: null,
          conversationalIntelligence: false
        };

        // Check phone numbers
        const numbers = await client.incomingPhoneNumbers.list({ limit: 50 });
        setupStatus.phoneNumbers = numbers.map(n => ({
          sid: n.sid,
          phoneNumber: n.phoneNumber,
          friendlyName: n.friendlyName
        }));

        // Check messaging services
        const msgServices = await client.messaging.v1.services.list({ limit: 1 });
        if (msgServices.length > 0) {
          setupStatus.messagingService = {
            sid: msgServices[0].sid,
            friendlyName: msgServices[0].friendlyName
          };
        }

        // Check Sync services
        const sServices = await client.sync.v1.services.list({ limit: 1 });
        if (sServices.length > 0) {
          setupStatus.syncService = {
            sid: sServices[0].sid,
            friendlyName: sServices[0].friendlyName
          };
        }

        // Check CI
        try {
          await client.intelligence.v2.transcripts.list({ limit: 1 });
          setupStatus.conversationalIntelligence = true;
        } catch (error) {
          setupStatus.conversationalIntelligence = false;
        }

        result = {
          success: true,
          setup: setupStatus
        };
        break;

      case 'updatePhoneNumber':
        // Update phone number webhook configuration
        const updatedNumber = await client.incomingPhoneNumbers(params.phoneNumberSid)
          .update({
            voiceUrl: params.voiceUrl,
            voiceMethod: params.voiceMethod || 'POST'
          });

        result = {
          success: true,
          phoneNumber: {
            sid: updatedNumber.sid,
            phoneNumber: updatedNumber.phoneNumber,
            voiceUrl: updatedNumber.voiceUrl,
            voiceMethod: updatedNumber.voiceMethod
          }
        };
        break;

      case 'getWorkshopCallHistory':
        // Get all calls made during workshop session with CI data if available
        try {
          const { phoneNumber, startTime, ciServiceSid } = params;

          // Fetch calls from the phone number since workshop start
          const startDate = startTime ? new Date(startTime) : new Date(Date.now() - 2 * 60 * 60 * 1000); // Default 2 hours ago

          const calls = await client.calls.list({
            to: phoneNumber,
            from: phoneNumber,
            startTimeAfter: startDate,
            limit: 50
          });

          // Also get calls TO or FROM this number
          const inboundCalls = await client.calls.list({
            to: phoneNumber,
            startTimeAfter: startDate,
            limit: 50
          });

          const outboundCalls = await client.calls.list({
            from: phoneNumber,
            startTimeAfter: startDate,
            limit: 50
          });

          // Combine and deduplicate
          const allCalls = [...inboundCalls, ...outboundCalls];
          const uniqueCalls = Array.from(new Map(allCalls.map(c => [c.sid, c])).values());

          // Sort by start time (newest first)
          uniqueCalls.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

          // Enrich with CI data if available
          const enrichedCalls = await Promise.all(uniqueCalls.map(async (call) => {
            const callData = {
              sid: call.sid,
              direction: call.direction,
              from: call.from,
              to: call.to,
              status: call.status,
              startTime: call.startTime,
              endTime: call.endTime,
              duration: call.duration,
              conversationalIntelligence: null
            };

            // Try to fetch CI data if service is configured
            if (ciServiceSid) {
              try {
                // Search for transcripts for this call SID
                const transcripts = await client.intelligence.v2.transcripts.list({
                  serviceSid: ciServiceSid,
                  limit: 10
                });

                // Find transcript matching this call
                const transcript = transcripts.find(t => t.customerKey === call.sid || t.sid === call.sid);

                if (transcript) {
                  // Fetch detailed transcript data
                  const transcriptDetails = await client.intelligence.v2
                    .transcripts(transcript.sid)
                    .fetch();

                  // Fetch sentences if available
                  let sentences = [];
                  try {
                    sentences = await client.intelligence.v2
                      .transcripts(transcript.sid)
                      .sentences
                      .list({ limit: 50 });
                  } catch (e) {
                    console.log('Sentences not yet available for transcript:', transcript.sid);
                  }

                  callData.conversationalIntelligence = {
                    sid: transcript.sid,
                    sentiment: transcriptDetails.sentiment || null,
                    topics: transcriptDetails.topics || [],
                    transcript: sentences.map(s => ({
                      speaker: s.speaker,
                      text: s.text,
                      timestamp: s.timestamp
                    }))
                  };
                }
              } catch (ciError) {
                console.log(`CI data not available for call ${call.sid}:`, ciError.message);
                // CI data not available for this call - that's okay
              }
            }

            return callData;
          }));

          result = {
            success: true,
            calls: enrichedCalls,
            count: enrichedCalls.length
          };
        } catch (callHistoryError) {
          console.error('Error fetching call history:', callHistoryError);
          result = {
            success: false,
            error: callHistoryError.message,
            calls: []
          };
        }
        break;

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error('Twilio API Error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      status: error.status,
      moreInfo: error.moreInfo,
      details: error.details
    });

    return res.status(500).json({
      error: error.message || 'Unknown error occurred',
      code: error.code || 'UNKNOWN_ERROR',
      status: error.status,
      details: error.details
    });
  }
}
