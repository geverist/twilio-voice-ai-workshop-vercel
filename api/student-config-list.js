/**
 * List Student Configurations API
 *
 * Returns a list of all student configurations (for debugging/admin purposes)
 */

import postgres from 'postgres';
import { applyCORS, handlePreflightRequest } from './_lib/cors.js';

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

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    console.log('📊 Fetching all student configurations...');

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

    // Get all student configurations (without sensitive data)
    const configs = await sql`
      SELECT
        session_token,
        student_name,
        created_at,
        updated_at,
        CASE WHEN openai_api_key IS NOT NULL THEN true ELSE false END as has_openai_key,
        CASE WHEN system_prompt IS NOT NULL THEN true ELSE false END as has_system_prompt
      FROM student_configs
      ORDER BY created_at DESC
      LIMIT 100
    `;

    console.log(`✅ Found ${configs.length} student configurations`);

    return res.status(200).json({
      success: true,
      count: configs.length,
      configs: configs.map(config => ({
        sessionToken: config.session_token,
        studentName: config.student_name,
        createdAt: config.created_at,
        updatedAt: config.updated_at,
        hasOpenAIKey: config.has_openai_key,
        hasSystemPrompt: config.has_system_prompt
      }))
    });

  } catch (error) {
    console.error('List configs error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to list configurations'
    });
  }
}
