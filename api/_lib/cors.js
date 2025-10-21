/**
 * CORS Utility
 *
 * Handles Cross-Origin Resource Sharing headers with security in mind.
 * Only allows requests from allowed origins.
 */

const ALLOWED_ORIGINS = [
  'https://twilio-voice-ai-workshop-vercel.vercel.app',
  'http://localhost:3000', // For local development
  'http://localhost:5173', // For Vite dev server
];

/**
 * Apply CORS headers to response
 *
 * @param {Request} req - The request object
 * @param {Response} res - The response object
 */
export function applyCORS(req, res) {
  const origin = req.headers['origin'] || req.headers['referer'];

  // Check if origin is allowed
  const isAllowed = ALLOWED_ORIGINS.some(allowed => {
    if (origin) {
      return origin.startsWith(allowed) || origin.includes(allowed);
    }
    return false;
  });

  if (isAllowed && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    // Default to first allowed origin if no origin header or not allowed
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0]);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
}

/**
 * Handle preflight OPTIONS request
 *
 * @param {Request} req
 * @param {Response} res
 * @returns {boolean} - Returns true if it was a preflight request
 */
export function handlePreflightRequest(req, res) {
  if (req.method === 'OPTIONS') {
    applyCORS(req, res);
    res.status(200).end();
    return true;
  }
  return false;
}
