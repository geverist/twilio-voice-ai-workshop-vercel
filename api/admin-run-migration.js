/**
 * Admin API: Run Database Migration
 *
 * WARNING: This is a temporary admin endpoint for running migrations.
 * In production, you should use proper migration tools or Vercel's dashboard.
 *
 * Usage: GET /api/admin-run-migration?migration=add-student-ai-settings
 */

import { sql } from '@vercel/postgres';

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

    console.log('Running migration: add-student-ai-settings');

    // Run the migration
    const migrationSteps = [];

    // Step 1: Add columns
    try {
      await sql`
        ALTER TABLE workshop_students
        ADD COLUMN IF NOT EXISTS ai_system_prompt TEXT DEFAULT 'You are a helpful voice assistant. Keep responses brief and conversational since they will be spoken aloud.',
        ADD COLUMN IF NOT EXISTS ai_greeting TEXT DEFAULT 'Hello! How can I help you today?',
        ADD COLUMN IF NOT EXISTS ai_voice VARCHAR(50) DEFAULT 'alloy',
        ADD COLUMN IF NOT EXISTS ai_tools JSONB DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS ai_settings_updated_at TIMESTAMP
      `;
      migrationSteps.push('✅ Added AI settings columns');
      console.log('✅ Added AI settings columns');
    } catch (error) {
      if (error.message.includes('already exists')) {
        migrationSteps.push('⚠️  AI settings columns already exist (skipped)');
        console.log('⚠️  Columns already exist');
      } else {
        throw error;
      }
    }

    // Step 2: Create index
    try {
      await sql`
        CREATE INDEX IF NOT EXISTS idx_students_ai_updated ON workshop_students(ai_settings_updated_at DESC)
      `;
      migrationSteps.push('✅ Created index on ai_settings_updated_at');
      console.log('✅ Created index');
    } catch (error) {
      if (error.message.includes('already exists')) {
        migrationSteps.push('⚠️  Index already exists (skipped)');
      } else {
        throw error;
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Migration completed successfully',
      steps: migrationSteps
    });

  } catch (error) {
    console.error('Migration error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to run migration',
      details: error.message
    });
  }
}
