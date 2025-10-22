/**
 * Admin: List Student Configs
 *
 * Lists all student sessions with detailed information for instructor dashboard
 * Requires admin password authentication
 *
 * POST /api/admin-list-configs
 * Body: {
 *   adminPassword: string
 * }
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

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { adminPassword } = req.body;

    // Authentication - check admin password
    const correctPassword = process.env.ADMIN_PASSWORD;

    if (!correctPassword) {
      return res.status(500).json({
        success: false,
        error: 'Admin password not configured in environment variables'
      });
    }

    if (!adminPassword) {
      return res.status(400).json({
        success: false,
        error: 'adminPassword is required'
      });
    }

    if (adminPassword !== correctPassword) {
      console.warn('⚠️ Unauthorized admin list attempt');
      return res.status(401).json({
        success: false,
        error: 'Invalid admin password'
      });
    }

    // Get all student configs with detailed information
    const result = await sql`
      SELECT
        session_token,
        student_name,
        selected_phone_number,
        selected_voice,
        tts_provider,
        CASE WHEN openai_api_key IS NOT NULL THEN true ELSE false END as has_api_key,
        CASE WHEN system_prompt IS NOT NULL THEN true ELSE false END as has_system_prompt,
        CASE WHEN tools_config IS NOT NULL THEN true ELSE false END as has_tools,
        created_at,
        updated_at
      FROM student_configs
      ORDER BY created_at DESC
    `;

    return res.status(200).json({
      success: true,
      count: result.length,
      sessions: result.map(session => ({
        sessionToken: session.session_token,
        studentName: session.student_name || 'Unnamed',
        phoneNumber: session.selected_phone_number,
        voice: session.selected_voice,
        ttsProvider: session.tts_provider,
        hasApiKey: session.has_api_key,
        hasSystemPrompt: session.has_system_prompt,
        hasTools: session.has_tools,
        createdAt: session.created_at,
        updatedAt: session.updated_at
      }))
    });

  } catch (error) {
    console.error('List configs error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to list configs'
    });
  }
}
