/**
 * Get Student AI Settings API
 *
 * Retrieves student's custom AI configuration for use by the shared WebSocket endpoint
 * Called by workshop-websocket.js when a student makes a test call
 */

import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
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

    const { sessionToken } = req.query;

    if (!sessionToken) {
      return res.status(400).json({
        success: false,
        error: 'sessionToken parameter is required'
      });
    }

    // Get student AI settings by session token
    const result = await sql`
      SELECT
        student_id as "studentId",
        student_name as "studentName",
        ai_system_prompt as "systemPrompt",
        ai_greeting as "greeting",
        ai_voice as "voice",
        ai_tools as "tools"
      FROM workshop_students
      WHERE student_id = ${sessionToken}
    `;

    if (result.rows.length === 0) {
      // Session not found - return default settings
      return res.status(200).json({
        success: true,
        settings: {
          sessionToken: sessionToken,
          systemPrompt: 'You are a helpful voice assistant. Keep responses brief and conversational since they will be spoken aloud.',
          greeting: 'Hello! How can I help you today?',
          voice: 'alloy',
          tools: []
        },
        isDefault: true
      });
    }

    return res.status(200).json({
      success: true,
      settings: result.rows[0],
      isDefault: false
    });

  } catch (error) {
    console.error('Error fetching student AI settings:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch AI settings',
      details: error.message
    });
  }
}
