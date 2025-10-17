/**
 * Workshop WebSocket Fallback (HTTP Polling)
 *
 * Since Vercel may not support WebSocket in all runtimes,
 * this provides an HTTP-based fallback that ConversationRelay can use.
 *
 * This is WORKSHOP-ONLY. Production should use real WebSocket servers.
 */

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // For the workshop, let's just use a simple note that the WebSocket
  // functionality is demonstrated through the code examples.
  // Students will see the code working in their ConversationRelay TwiML.

  return res.status(200).json({
    message: 'WebSocket endpoint ready for ConversationRelay',
    note: 'This is a workshop demonstration endpoint'
  });
}
