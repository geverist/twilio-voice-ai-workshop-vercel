/**
 * Database Migration Script
 *
 * Adds new columns to student_configs table for admin panel support
 * Run this via: GET /api/db-migrate
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
    console.log('🔄 Starting database migration...');

    // Ensure base table exists
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

    console.log('✅ Base table ensured');

    // Add new columns (will skip if they already exist)
    const migrations = [
      { name: 'use_case_description', sql: `ALTER TABLE student_configs ADD COLUMN IF NOT EXISTS use_case_description TEXT` },
      { name: 'call_direction', sql: `ALTER TABLE student_configs ADD COLUMN IF NOT EXISTS call_direction TEXT` },
      { name: 'ivr_greeting', sql: `ALTER TABLE student_configs ADD COLUMN IF NOT EXISTS ivr_greeting TEXT` },
      { name: 'tts_provider', sql: `ALTER TABLE student_configs ADD COLUMN IF NOT EXISTS tts_provider TEXT` },
      { name: 'selected_voice', sql: `ALTER TABLE student_configs ADD COLUMN IF NOT EXISTS selected_voice TEXT` },
      { name: 'selected_phone_number', sql: `ALTER TABLE student_configs ADD COLUMN IF NOT EXISTS selected_phone_number TEXT` },
      { name: 'websocket_url', sql: `ALTER TABLE student_configs ADD COLUMN IF NOT EXISTS websocket_url TEXT` },
      { name: 'codespace_url', sql: `ALTER TABLE student_configs ADD COLUMN IF NOT EXISTS codespace_url TEXT` },
      { name: 'github_repo_url', sql: `ALTER TABLE student_configs ADD COLUMN IF NOT EXISTS github_repo_url TEXT` },
      { name: 'railway_url', sql: `ALTER TABLE student_configs ADD COLUMN IF NOT EXISTS railway_url TEXT` },
      { name: 'openai_assistant_id', sql: `ALTER TABLE student_configs ADD COLUMN IF NOT EXISTS openai_assistant_id TEXT` }
    ];

    for (const migration of migrations) {
      try {
        await sql.unsafe(migration.sql);
        console.log(`  ✓ Added column: ${migration.name}`);
      } catch (error) {
        // Column might already exist
        console.log(`  → Column ${migration.name} already exists or error:`, error.message);
      }
    }

    // Get final table structure
    const columns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'student_configs'
      ORDER BY ordinal_position
    `;

    console.log('✅ Migration complete!');

    return res.status(200).json({
      success: true,
      message: 'Database migration completed',
      columns: columns.map(col => ({
        name: col.column_name,
        type: col.data_type,
        nullable: col.is_nullable === 'YES'
      }))
    });

  } catch (error) {
    console.error('❌ Migration error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Migration failed'
    });
  }
}
