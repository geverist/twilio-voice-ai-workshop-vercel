/**
 * Update Student Configuration API
 *
 * Updates specific fields in a student's configuration
 * Used by admin panel to modify settings
 *
 * PUT /api/student-config-update
 * Body: {
 *   sessionToken: string (required),
 *   systemPrompt?: string,
 *   ivrGreeting?: string,
 *   tools?: array,
 *   voiceSettings?: object,
 *   ttsProvider?: string,
 *   selectedVoice?: string,
 *   ... any other field
 * }
 */

import postgres from 'postgres';
import { applyCORS, handlePreflightRequest } from './_lib/cors.js';
import { applyRateLimit } from './_lib/ratelimit.js';
import {
  validateRequired,
  validateString,
  handleValidationError
} from './_lib/validation.js';

// Create postgres connection
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

  if (req.method !== 'PUT') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Apply rate limiting
  const allowed = await applyRateLimit(req, res);
  if (!allowed) {
    return;
  }

  try {
    const { sessionToken, ...updates } = req.body;

    // Validation
    try {
      validateRequired(req.body, ['sessionToken']);
      validateString(sessionToken, 'sessionToken', { minLength: 10, maxLength: 200 });
    } catch (validationError) {
      return handleValidationError(validationError, res);
    }

    console.log(`📝 Updating config for session: ${sessionToken.substring(0, 20)}...`);

    // Check if config exists
    const existing = await sql`
      SELECT session_token FROM student_configs
      WHERE session_token = ${sessionToken}
    `;

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Configuration not found for this session token'
      });
    }

    // Build dynamic update query
    const updateFields = [];
    const updateValues = {};

    // Map of allowed fields to update
    const allowedFields = {
      studentName: 'student_name',
      systemPrompt: 'system_prompt',
      tools: 'tools',
      voiceSettings: 'voice_settings',
      useCaseDescription: 'use_case_description',
      callDirection: 'call_direction',
      ivrGreeting: 'ivr_greeting',
      ttsProvider: 'tts_provider',
      selectedVoice: 'selected_voice',
      selectedPhoneNumber: 'selected_phone_number',
      websocketUrl: 'websocket_url',
      codespaceUrl: 'codespace_url',
      githubRepoUrl: 'github_repo_url',
      railwayUrl: 'railway_url'
    };

    // Build SET clause
    for (const [camelKey, dbKey] of Object.entries(allowedFields)) {
      if (updates[camelKey] !== undefined) {
        updateFields.push(dbKey);
        // JSON fields need to be stringified
        if (dbKey === 'tools' || dbKey === 'voice_settings') {
          updateValues[dbKey] = JSON.stringify(updates[camelKey]);
        } else {
          updateValues[dbKey] = updates[camelKey];
        }
      }
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update'
      });
    }

    // Build and execute dynamic update
    const setClauses = updateFields.map(field => `${field} = $${field}`).join(', ');

    await sql`
      UPDATE student_configs
      SET ${sql.unsafe(setClauses + ', updated_at = NOW()')}
      WHERE session_token = ${sessionToken}
    `.values(updateValues);

    console.log(`✅ Updated ${updateFields.length} fields for session: ${sessionToken.substring(0, 20)}...`);

    // Return updated config
    const updated = await sql`
      SELECT * FROM student_configs
      WHERE session_token = ${sessionToken}
    `;

    return res.status(200).json({
      success: true,
      message: 'Configuration updated',
      updatedFields: updateFields,
      config: updated[0]
    });

  } catch (error) {
    console.error('Update config error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to update configuration'
    });
  }
}
