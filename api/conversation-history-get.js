/**
 * Conversation History Get API
 *
 * GET /api/conversation-history-get?sessionToken=xxx&limit=50
 * Returns conversation history for a student's sessions
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

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    // Check if Postgres is configured
    if (!process.env.POSTGRES_URL) {
      return res.status(500).json({
        success: false,
        error: 'Database not configured'
      });
    }

    const { sessionToken, conversationSessionId, limit = 50 } = req.query;

    if (!sessionToken) {
      return res.status(400).json({
        success: false,
        error: 'sessionToken parameter is required'
      });
    }

    let sessions;

    if (conversationSessionId) {
      // Get specific conversation session with history
      sessions = await sql`
        SELECT
          cs.id,
          cs.call_sid as "callSid",
          cs.from_number as "fromNumber",
          cs.to_number as "toNumber",
          cs.direction,
          cs.started_at as "startedAt",
          cs.ended_at as "endedAt",
          cs.duration_seconds as "durationSeconds",
          cs.turn_count as "turnCount",
          cs.status,
          cs.metadata
        FROM conversation_sessions cs
        WHERE cs.id = ${conversationSessionId}
          AND cs.session_token = ${sessionToken}
      `;

      if (sessions.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Conversation session not found'
        });
      }

      // Get conversation history for this session
      const history = await sql`
        SELECT
          id,
          turn_number as "turnNumber",
          role,
          content,
          timestamp,
          metadata
        FROM conversation_history
        WHERE conversation_session_id = ${conversationSessionId}
        ORDER BY turn_number ASC
      `;

      sessions[0].history = history;

      return res.status(200).json({
        success: true,
        conversation: sessions[0]
      });

    } else {
      // Get all conversation sessions for student
      sessions = await sql`
        SELECT
          cs.id,
          cs.call_sid as "callSid",
          cs.from_number as "fromNumber",
          cs.to_number as "toNumber",
          cs.direction,
          cs.started_at as "startedAt",
          cs.ended_at as "endedAt",
          cs.duration_seconds as "durationSeconds",
          cs.turn_count as "turnCount",
          cs.status,
          cs.metadata
        FROM conversation_sessions cs
        WHERE cs.session_token = ${sessionToken}
        ORDER BY cs.started_at DESC
        LIMIT ${parseInt(limit)}
      `;

      // Get turn count for each session (as a summary)
      for (const session of sessions) {
        const historyCount = await sql`
          SELECT COUNT(*) as count
          FROM conversation_history
          WHERE conversation_session_id = ${session.id}
        `;
        session.messageCount = parseInt(historyCount[0].count);
      }

      return res.status(200).json({
        success: true,
        conversations: sessions,
        count: sessions.length
      });
    }

  } catch (error) {
    console.error('Error fetching conversation history:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch conversation history',
      details: error.message
    });
  }
}
