/**
 * Update Student AI Settings API
 *
 * Saves student's custom AI configuration (prompt, greeting, tools, voice)
 * Used when students commit WebSocket handler code in Steps 5, 7, 8
 */

import { sql } from '@vercel/postgres';
import { applyCORS, handlePreflightRequest } from './_lib/cors.js';
import { applyRateLimit } from './_lib/ratelimit.js';
import {
  validateRequired,
  validateString,
  validateArray,
  handleValidationError,
  sanitizeString
} from './_lib/validation.js';

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
      SELECT student_id FROM workshop_students WHERE student_id = ${sessionToken}
    `;

    if (existing.rows.length === 0) {
      // Create new record for this session
      const result = await sql`
        INSERT INTO workshop_students (
          student_id,
          student_email,
          student_name,
          ai_system_prompt,
          ai_greeting,
          ai_voice,
          ai_tools,
          ai_settings_updated_at,
          created_at
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
          student_id as "studentId",
          ai_system_prompt as "systemPrompt",
          ai_greeting as "greeting",
          ai_voice as "voice",
          ai_tools as "tools"
      `;

      return res.status(200).json({
        success: true,
        message: 'AI settings created successfully',
        settings: result.rows[0]
      });
    }

    // Update existing record
    const result = await sql`
      UPDATE workshop_students
      SET
        ai_system_prompt = COALESCE(${systemPrompt}, ai_system_prompt),
        ai_greeting = COALESCE(${greeting}, ai_greeting),
        ai_voice = COALESCE(${voice}, ai_voice),
        ai_tools = COALESCE(${tools ? JSON.stringify(tools) : null}::jsonb, ai_tools),
        ai_settings_updated_at = NOW()
      WHERE student_id = ${sessionToken}
      RETURNING
        student_id as "studentId",
        ai_system_prompt as "systemPrompt",
        ai_greeting as "greeting",
        ai_voice as "voice",
        ai_tools as "tools",
        ai_settings_updated_at as "updatedAt"
    `;

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Student not found. Please complete Step 1 first.'
      });
    }

    console.log(`✓ Updated AI settings for ${studentEmail}`);

    return res.status(200).json({
      success: true,
      message: 'AI settings updated successfully',
      settings: result.rows[0]
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
