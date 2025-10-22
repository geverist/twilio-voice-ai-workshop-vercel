/**
 * Admin: List Student Configs
 *
 * Lists all student session tokens in the database (for debugging)
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

  try {
    // Get all session tokens (don't expose sensitive data like API keys)
    const result = await sql`
      SELECT
        session_token,
        student_name,
        created_at,
        updated_at
      FROM student_configs
      ORDER BY created_at DESC
    `;

    return res.status(200).json({
      success: true,
      count: result.length,
      configs: result
    });

  } catch (error) {
    console.error('List configs error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to list configs'
    });
  }
}
