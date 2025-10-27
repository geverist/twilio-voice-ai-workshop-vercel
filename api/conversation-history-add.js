/**
 * Conversation History Add API
 *
 * POST /api/conversation-history-add
 * Adds a message to conversation history
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
      conversationSessionId,
      turnNumber,
      role,
      content,
      metadata
    } = req.body;

    if (!conversationSessionId || !role || !content) {
      return res.status(400).json({
        success: false,
        error: 'conversationSessionId, role, and content are required'
      });
    }

    // Add message to conversation history
    await sql`
      INSERT INTO conversation_history (
        conversation_session_id,
        turn_number,
        role,
        content,
        metadata
      ) VALUES (
        ${conversationSessionId},
        ${turnNumber || 0},
        ${role},
        ${content},
        ${metadata ? JSON.stringify(metadata) : '{}'}::jsonb
      )
    `;

    return res.status(200).json({
      success: true
    });

  } catch (error) {
    console.error('Error adding conversation history:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to add conversation history',
      details: error.message
    });
  }
}
