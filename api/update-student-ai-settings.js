/**
 * Update Student AI Settings API
 *
 * Saves student's custom AI configuration (prompt, greeting, tools, voice)
 * Used when students commit WebSocket handler code in Steps 5, 7, 8
 */

import postgres from 'postgres';
import { applyCORS, handlePreflightRequest } from './_lib/cors.js';
import { applyRateLimit } from './_lib/ratelimit.js';
import {
  validateRequired,
  validateString,
  validateArray,
  handleValidationError,
  sanitizeString
} from './_lib/validation.js';

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

  // Apply rate limiting
  const allowed = await applyRateLimit(req, res);
  if (!allowed) {
    return;
  }

  try {
    // Check if Postgres is configured
    if (!process.env.POSTGRES_URL) {
      return res.status(500).json({
        success: false,
        error: 'Database not configured'
      });
    }

    const {
      sessionToken,
      systemPrompt,
      greeting,
      voice,
      tools
    } = req.body;

    // Input validation
    try {
      validateRequired(req.body, ['sessionToken']);
      validateString(sessionToken, 'sessionToken', { minLength: 10, maxLength: 100 });

      if (systemPrompt) {
        validateString(systemPrompt, 'systemPrompt', { maxLength: 5000 });
      }

      if (greeting) {
        validateString(greeting, 'greeting', { maxLength: 1000 });
      }

      if (voice) {
        validateString(voice, 'voice', { maxLength: 50 });
      }

      if (tools) {
        validateArray(tools, 'tools', { maxLength: 50 });
      }
    } catch (validationError) {
      return handleValidationError(validationError, res);
    }

    // First check if a record exists for this session token
    const existing = await sql`
      SELECT session_token FROM student_configs WHERE session_token = ${sessionToken}
    `;

    if (existing.length === 0) {
      // Create new record for this session
      const result = await sql`
        INSERT INTO student_configs (
          session_token,
          student_email,
          student_name,
          system_prompt,
          ivr_greeting,
          selected_voice,
          tools,
          created_at,
          updated_at
        ) VALUES (
          ${sessionToken},
          ${sessionToken + '@workshop.local'},
          ${'Workshop Student'},
          ${systemPrompt || 'You are a helpful voice assistant. Keep responses brief and conversational since they will be spoken aloud.'},
          ${greeting || 'Hello! How can I help you today?'},
          ${voice || 'alloy'},
          ${tools ? JSON.stringify(tools) : '[]'},
          NOW(),
          NOW()
        )
        RETURNING
          session_token as "sessionToken",
          system_prompt as "systemPrompt",
          ivr_greeting as "greeting",
          selected_voice as "voice",
          tools
      `;

      return res.status(200).json({
        success: true,
        message: 'AI settings created successfully',
        settings: result[0]
      });
    }

    // Update existing record
    // Convert tools to JSON string if provided, otherwise keep existing
    const toolsJson = tools !== undefined ? JSON.stringify(tools) : null;

    const result = await sql`
      UPDATE student_configs
      SET
        system_prompt = COALESCE(${systemPrompt}, system_prompt),
        ivr_greeting = COALESCE(${greeting}, ivr_greeting),
        selected_voice = COALESCE(${voice}, selected_voice),
        tools = CASE
          WHEN ${toolsJson}::text IS NOT NULL THEN ${toolsJson}::jsonb
          ELSE tools
        END,
        updated_at = NOW()
      WHERE session_token = ${sessionToken}
      RETURNING
        session_token as "sessionToken",
        system_prompt as "systemPrompt",
        ivr_greeting as "greeting",
        selected_voice as "voice",
        tools,
        updated_at as "updatedAt"
    `;

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Student not found. Please complete Step 1 first.'
      });
    }

    console.log(`✓ Updated AI settings for session: ${sessionToken.substring(0, 8)}...`);

    return res.status(200).json({
      success: true,
      message: 'AI settings updated successfully',
      settings: result[0]
    });

  } catch (error) {
    console.error('Error updating student AI settings:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update AI settings',
      details: error.message
    });
  }
}
