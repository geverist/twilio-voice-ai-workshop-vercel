/**
 * Generate Session Token API
 *
 * Creates a cryptographically secure session token for workshop participants.
 * This replaces client-side token generation for better security.
 *
 * POST /api/generate-session
 * {
 *   "studentEmail": "student@example.com",  // optional
 *   "studentName": "John Doe"               // optional
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "sessionToken": "ws_a1b2c3d4e5f6..."
 * }
 */

import crypto from 'crypto';
import { applyCORS, handlePreflightRequest } from './_lib/cors.js';

export default async function handler(req, res) {
  applyCORS(req, res);

  if (handlePreflightRequest(req, res)) {
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.'
    });
  }

  try {
    // Generate cryptographically secure session token
    const randomBytes = crypto.randomBytes(32).toString('hex');
    const sessionToken = `ws_${Date.now()}_${randomBytes}`;

    return res.status(200).json({
      success: true,
      sessionToken: sessionToken
    });

  } catch (error) {
    console.error('Error generating session token:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate session token',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
