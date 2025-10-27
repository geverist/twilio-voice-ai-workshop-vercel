/**
 * Use Case Activate API
 *
 * POST /api/use-case-activate
 * Activates a use case template for a student session
 */

import postgres from 'postgres';
import { applyCORS, handlePreflightRequest } from './_lib/cors.js';
import { applyRateLimit } from './_lib/ratelimit.js';
import {
  validateRequired,
  validateString,
  handleValidationError
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
      useCaseTemplateId,
      customizations
    } = req.body;

    // Input validation
    try {
      validateRequired(req.body, ['sessionToken', 'useCaseTemplateId']);
      validateString(sessionToken, 'sessionToken', { minLength: 10, maxLength: 100 });
      validateString(useCaseTemplateId, 'useCaseTemplateId', { minLength: 10, maxLength: 100 });
    } catch (validationError) {
      return handleValidationError(validationError, res);
    }

    // Get the use case template
    const template = await sql`
      SELECT * FROM use_case_templates
      WHERE id = ${useCaseTemplateId} AND is_active = true
    `;

    if (template.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Use case template not found'
      });
    }

    const useCase = template[0];

    // Check if student already has this use case
    const existing = await sql`
      SELECT id FROM student_use_cases
      WHERE session_token = ${sessionToken}
        AND use_case_template_id = ${useCaseTemplateId}
    `;

    let studentUseCaseId;

    if (existing.length > 0) {
      // Update existing
      const updated = await sql`
        UPDATE student_use_cases
        SET
          custom_system_prompt = ${customizations?.systemPrompt || null},
          custom_greeting = ${customizations?.greeting || null},
          custom_voice = ${customizations?.voice || null},
          custom_tools = ${customizations?.tools ? JSON.stringify(customizations.tools) : null}::jsonb,
          is_active = true,
          updated_at = NOW()
        WHERE id = ${existing[0].id}
        RETURNING id
      `;
      studentUseCaseId = updated[0].id;
    } else {
      // Create new
      const created = await sql`
        INSERT INTO student_use_cases (
          session_token,
          use_case_template_id,
          custom_system_prompt,
          custom_greeting,
          custom_voice,
          custom_tools,
          is_active
        ) VALUES (
          ${sessionToken},
          ${useCaseTemplateId},
          ${customizations?.systemPrompt || null},
          ${customizations?.greeting || null},
          ${customizations?.voice || null},
          ${customizations?.tools ? JSON.stringify(customizations.tools) : null}::jsonb,
          true
        )
        RETURNING id
      `;
      studentUseCaseId = created[0].id;
    }

    // Update student_configs to enable use case and set active use case
    await sql`
      UPDATE student_configs
      SET
        use_case_enabled = true,
        active_use_case_id = ${studentUseCaseId},
        system_prompt = ${customizations?.systemPrompt || useCase.system_prompt},
        ivr_greeting = ${customizations?.greeting || useCase.greeting},
        selected_voice = ${customizations?.voice || useCase.voice},
        tools = ${customizations?.tools ? JSON.stringify(customizations.tools) : useCase.sample_tools}::jsonb,
        updated_at = NOW()
      WHERE session_token = ${sessionToken}
    `;

    console.log(`✓ Activated use case "${useCase.display_name}" for session: ${sessionToken.substring(0, 8)}...`);

    return res.status(200).json({
      success: true,
      message: `Use case "${useCase.display_name}" activated successfully`,
      studentUseCaseId,
      appliedSettings: {
        systemPrompt: customizations?.systemPrompt || useCase.system_prompt,
        greeting: customizations?.greeting || useCase.greeting,
        voice: customizations?.voice || useCase.voice,
        tools: customizations?.tools || JSON.parse(useCase.sample_tools || '[]')
      }
    });

  } catch (error) {
    console.error('Error activating use case:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to activate use case',
      details: error.message
    });
  }
}
