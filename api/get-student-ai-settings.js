/**
 * Get Student AI Settings API
 *
 * Retrieves student's custom AI configuration for use by the shared WebSocket endpoint
 * Called by workshop-websocket.js when a student makes a test call
 *
 * Updated to use normalized V2 schema (student_configs table)
 */

import postgres from 'postgres';
import { applyCORS, handlePreflightRequest } from './_lib/cors.js';
import { decryptApiKey } from './_lib/encryption.js';

const sql = postgres(process.env.POSTGRES_URL, {
  ssl: 'require',
  max: 1
});

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

    // Get student AI settings by session token from student_configs table
    const result = await sql`
      SELECT
        session_token,
        student_name,
        openai_api_key,
        system_prompt,
        ivr_greeting,
        selected_voice,
        tools
      FROM student_configs
      WHERE session_token = ${sessionToken}
    `;

    if (result.length === 0) {
      // Session not found - return default settings WITHOUT API key
      return res.status(200).json({
        success: true,
        settings: {
          sessionToken: sessionToken,
          systemPrompt: 'You are a helpful voice assistant. Keep responses brief and conversational since they will be spoken aloud.',
          greeting: 'Hello! How can I help you today?',
          voice: 'alloy',
          tools: []
        },
        isDefault: true,
        error: 'Session not found - using default settings. Student needs to configure OpenAI API key.'
      });
    }

    const config = result[0];

    // Decrypt OpenAI API key if present
    let decryptedApiKey = null;
    if (config.openai_api_key) {
      try {
        decryptedApiKey = decryptApiKey(config.openai_api_key);
        console.log(`🔓 OpenAI API key decrypted for session: ${sessionToken.substring(0, 8)}...`);
      } catch (error) {
        console.error('Failed to decrypt API key:', error.message);
        // Return error but continue with settings
        console.warn('⚠️ Returning settings without API key (decryption failed)');
      }
    }

    return res.status(200).json({
      success: true,
      settings: {
        sessionToken: config.session_token,
        studentName: config.student_name,
        openaiApiKey: decryptedApiKey,
        systemPrompt: config.system_prompt || 'You are a helpful voice assistant. Keep responses brief and conversational since they will be spoken aloud.',
        greeting: config.ivr_greeting || 'Hello! How can I help you today?',
        voice: config.selected_voice || 'alloy',
        tools: config.tools || []
      },
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
