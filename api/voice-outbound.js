/**
 * Outbound Voice TwiML Handler
 *
 * Handles outbound calls initiated from Twilio Client SDK (browser)
 * Returns TwiML to dial the specified number
 *
 * POST /api/voice-outbound
 * Body: { To: phoneNumber }
 */

import { applyCORS, handlePreflightRequest } from './_lib/cors.js';

export default async function handler(req, res) {
  applyCORS(req, res);

  if (handlePreflightRequest(req, res)) {
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { To } = req.body;

    if (!To) {
      return res.status(400).send('Missing "To" parameter');
    }

    console.log(`📞 Browser call initiated to: ${To}`);

    // Generate TwiML to dial the number
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${process.env.TWILIO_PHONE_NUMBER || To}">
    <Number>${To}</Number>
  </Dial>
</Response>`;

    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(twiml);

  } catch (error) {
    console.error('Outbound call error:', error);

    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We're sorry, but we could not complete your call. Please try again later.</Say>
</Response>`;

    res.setHeader('Content-Type', 'text/xml');
    return res.status(500).send(errorTwiml);
  }
}
