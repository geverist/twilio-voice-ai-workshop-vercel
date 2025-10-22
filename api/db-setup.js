/**
 * Database Setup API
 *
 * Creates the student_configs table if it doesn't exist.
 * Also provides a health check for the database connection.
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
    // Create table
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

    // Get table info
    const result = await sql`
      SELECT COUNT(*) as count
      FROM student_configs
    `;

    const count = parseInt(result[0].count);

    return res.status(200).json({
      success: true,
      message: 'Database schema initialized',
      studentCount: count
    });

  } catch (error) {
    console.error('Database setup error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Database setup failed'
    });
  }
}
