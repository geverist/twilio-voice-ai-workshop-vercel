/**
 * Save Student Configuration API
 *
 * Saves student's AI configuration (system prompt, tools, etc.) to Vercel Postgres.
 * This config is used by the shared WebSocket server to handle their calls.
 */

import { sql } from '@vercel/postgres';
import { applyCORS, handlePreflightRequest } from './_lib/cors.js';
import { applyRateLimit } from './_lib/ratelimit.js';
import {
  validateRequired,
  validateString,
  handleValidationError
} from './_lib/validation.js';

export default async function handler(req, res) {
  // Apply CORS
  applyCORS(req, res);

  // Handle preflight
  if (handlePreflightRequest(req, res)) {
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Apply rate limiting
  const allowed = await applyRateLimit(req, res);
  if (!allowed) {
    return;
  }

  try {
    const {
      sessionToken,
      studentName,
      openaiApiKey,
      systemPrompt,
      tools,
      voiceSettings
    } = req.body;

    // Input validation
    try {
      validateRequired(req.body, ['sessionToken']);
      validateString(sessionToken, 'sessionToken', { minLength: 10, maxLength: 200 });

      if (systemPrompt) {
        validateString(systemPrompt, 'systemPrompt', { minLength: 1, maxLength: 5000 });
      }
    } catch (validationError) {
      return handleValidationError(validationError, res);
    }

    console.log(`💾 Saving config for session: ${sessionToken.substring(0, 8)}...`);

    // Ensure table exists
    await sql`
      CREATE TABLE IF NOT EXISTS student_configs (
        session_token TEXT PRIMARY KEY,
        student_name TEXT,
        openai_api_key TEXT,
        system_prompt TEXT,
        tools JSONB DEFAULT '[]',
        voice_settings JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // Insert or update student configuration
    await sql`
      INSERT INTO student_configs (
        session_token,
        student_name,
        openai_api_key,
        system_prompt,
        tools,
        voice_settings,
        updated_at
      ) VALUES (
        ${sessionToken},
        ${studentName || null},
        ${openaiApiKey || null},
        ${systemPrompt || null},
        ${JSON.stringify(tools || [])},
        ${JSON.stringify(voiceSettings || {})},
        NOW()
      )
      ON CONFLICT (session_token)
      DO UPDATE SET
        student_name = EXCLUDED.student_name,
        openai_api_key = EXCLUDED.openai_api_key,
        system_prompt = EXCLUDED.system_prompt,
        tools = EXCLUDED.tools,
        voice_settings = EXCLUDED.voice_settings,
        updated_at = NOW()
    `;

    console.log(`✅ Config saved for session: ${sessionToken.substring(0, 8)}...`);

    // Generate WebSocket URL
    const websocketUrl = `wss://${process.env.RAILWAY_WEBSOCKET_DOMAIN}/ws/${sessionToken}`;

    return res.status(200).json({
      success: true,
      message: 'Configuration saved',
      websocketUrl: websocketUrl
    });

  } catch (error) {
    console.error('Save config error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to save configuration'
    });
  }
}
