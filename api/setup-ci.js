/**
 * Conversational Intelligence Setup (Vercel Version)
 *
 * Sets up Twilio Conversational Intelligence service for call analytics.
 * This runs silently in the background during Step 3 service provisioning.
 *
 * Students will see the results in Step 9 analytics dashboard.
 */

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { accountSid, authToken, action } = req.body || req.query;

  if (!accountSid || !authToken) {
    return res.status(400).json({
      success: false,
      error: 'Account SID and Auth Token are required'
    });
  }

  try {
    const baseUrl = 'https://intelligence.twilio.com/v2';
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    // =========================================================================
    // CREATE CONVERSATIONAL INTELLIGENCE SERVICE
    // =========================================================================
    if (action === 'create-service' || req.method === 'POST') {
      console.log('Creating Conversational Intelligence service...');

      // Create Intelligence Service
      const createResponse = await fetch(`${baseUrl}/Services`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          UniqueName: `workshop-analytics-${Date.now()}`,
          FriendlyName: 'Voice AI Workshop Analytics',
          AutoTranscribe: 'true',  // Automatically transcribe recordings
          LanguageCode: 'en-US'
        })
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error('CI Service creation failed:', errorText);
        return res.status(createResponse.status).json({
          success: false,
          error: 'Failed to create Conversational Intelligence service',
          details: errorText
        });
      }

      const serviceData = await createResponse.json();
      console.log('CI Service created:', serviceData.sid);

      // =========================================================================
      // ADD PRE-BUILT LANGUAGE OPERATORS
      // =========================================================================
      // These operators analyze transcripts for sentiment, PII, topics, etc.
      const operators = [
        {
          sid: 'LY4ce7be83d88649e3a24b23571077c122', // Sentiment Analysis
          name: 'sentiment'
        },
        {
          sid: 'LYbcd7006fc1f69d0c522e6fde532856eb', // PII Redaction
          name: 'pii'
        }
      ];

      for (const operator of operators) {
        try {
          const attachResponse = await fetch(
            `${baseUrl}/Services/${serviceData.sid}/Operators/${operator.sid}`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
              }
            }
          );

          if (attachResponse.ok) {
            console.log(`✓ Attached ${operator.name} operator`);
          }
        } catch (opError) {
          console.warn(`Could not attach ${operator.name} operator:`, opError.message);
          // Don't fail if operators can't be attached
        }
      }

      return res.status(200).json({
        success: true,
        serviceSid: serviceData.sid,
        message: 'Conversational Intelligence service created',
        operators: operators.map(o => o.name)
      });
    }

    // =========================================================================
    // GET SERVICE STATUS
    // =========================================================================
    if (action === 'get-service' && req.method === 'GET') {
      const { serviceSid } = req.query;

      const getResponse = await fetch(`${baseUrl}/Services/${serviceSid}`, {
        headers: {
          'Authorization': `Basic ${auth}`
        }
      });

      if (!getResponse.ok) {
        return res.status(404).json({
          success: false,
          error: 'Service not found'
        });
      }

      const serviceData = await getResponse.json();
      return res.status(200).json({
        success: true,
        service: serviceData
      });
    }

    return res.status(400).json({
      success: false,
      error: 'Invalid action'
    });

  } catch (error) {
    console.error('CI Setup error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to set up Conversational Intelligence',
      details: error.message
    });
  }
}
