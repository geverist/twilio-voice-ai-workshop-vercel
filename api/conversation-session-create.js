/**
 * Conversation Session Create API
 *
 * POST /api/conversation-session-create
 * Creates a new conversation session when a call starts
 */

import postgres from 'postgres';
import { applyCORS, handlePreflightRequest } from './_lib/cors.js';

const sql = postgres(process.env.POSTGRES_URL, {
  ssl: 'require',
  max: 1
});

export default async function handler(req, res) {
  // Apply CORS
  applyCORS(req, res);

  // Handle preflight
  if (handlePreflightRequest(req, res)) {
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    if (!process.env.POSTGRES_URL) {
      return res.status(500).json({
        success: false,
        error: 'Database not configured'
      });
    }

    const {
      sessionToken,
      callSid,
      fromNumber,
      toNumber,
      direction
    } = req.body;

    if (!sessionToken) {
      return res.status(400).json({
        success: false,
        error: 'sessionToken is required'
      });
    }

    // Create conversation session
    const result = await sql`
      INSERT INTO conversation_sessions (
        session_token,
        call_sid,
        from_number,
        to_number,
        direction,
        status
      ) VALUES (
        ${sessionToken},
        ${callSid || null},
        ${fromNumber || null},
        ${toNumber || null},
        ${direction || 'inbound'},
        'active'
      )
      RETURNING id
    `;

    const conversationSessionId = result[0].id;

    return res.status(200).json({
      success: true,
      conversationSessionId
    });

  } catch (error) {
    console.error('Error creating conversation session:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create conversation session',
      details: error.message
    });
  }
}
