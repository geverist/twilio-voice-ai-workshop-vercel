/**
 * Conversation Session End API
 *
 * POST /api/conversation-session-end
 * Ends a conversation session when a call disconnects
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

    const { conversationSessionId, turnCount } = req.body;

    if (!conversationSessionId) {
      return res.status(400).json({
        success: false,
        error: 'conversationSessionId is required'
      });
    }

    // Get session start time to calculate duration
    const session = await sql`
      SELECT started_at FROM conversation_sessions
      WHERE id = ${conversationSessionId}
    `;

    if (session.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Conversation session not found'
      });
    }

    const startedAt = new Date(session[0].started_at);
    const endedAt = new Date();
    const durationSeconds = Math.floor((endedAt - startedAt) / 1000);

    // End conversation session
    await sql`
      UPDATE conversation_sessions
      SET
        ended_at = NOW(),
        duration_seconds = ${durationSeconds},
        turn_count = ${turnCount || 0},
        status = 'completed',
        updated_at = NOW()
      WHERE id = ${conversationSessionId}
    `;

    return res.status(200).json({
      success: true,
      durationSeconds,
      turnCount
    });

  } catch (error) {
    console.error('Error ending conversation session:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to end conversation session',
      details: error.message
    });
  }
}
