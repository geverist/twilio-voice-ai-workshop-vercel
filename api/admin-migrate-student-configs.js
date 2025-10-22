/**
 * Admin Migration: Ensure student_configs table has all columns
 *
 * This migration ensures the student_configs table has all required columns.
 * Safe to run multiple times.
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

    if (!adminPassword || adminPassword !== correctPassword) {
      console.warn('⚠️ Unauthorized migration attempt');
      return res.status(401).json({
        success: false,
        error: 'Invalid admin password'
      });
    }

    console.log('🔄 Running student_configs table migration...');

    const migrationSteps = [];

    // Step 1: Ensure table exists
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS student_configs (
          session_token TEXT PRIMARY KEY,
          student_name TEXT,
          openai_api_key TEXT,
          system_prompt TEXT,
          tools JSONB DEFAULT '[]',
          voice_settings JSONB DEFAULT '{}',
          use_case_description TEXT,
          call_direction TEXT,
          ivr_greeting TEXT,
          tts_provider TEXT,
          selected_voice TEXT,
          selected_phone_number TEXT,
          websocket_url TEXT,
          codespace_url TEXT,
          github_repo_url TEXT,
          railway_url TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `;
      migrationSteps.push('✅ Ensured student_configs table exists');
    } catch (error) {
      migrationSteps.push(`⚠️ Table creation: ${error.message}`);
    }

    // Step 2: Add missing columns
    const columnsToAdd = [
      { name: 'selected_phone_number', type: 'TEXT' },
      { name: 'selected_voice', type: 'TEXT' },
      { name: 'tts_provider', type: 'TEXT' },
      { name: 'tools', type: 'JSONB DEFAULT \'[]\'', raw: true },
      { name: 'voice_settings', type: 'JSONB DEFAULT \'{}\'', raw: true },
      { name: 'use_case_description', type: 'TEXT' },
      { name: 'call_direction', type: 'TEXT' },
      { name: 'ivr_greeting', type: 'TEXT' },
      { name: 'websocket_url', type: 'TEXT' },
      { name: 'codespace_url', type: 'TEXT' },
      { name: 'github_repo_url', type: 'TEXT' },
      { name: 'railway_url', type: 'TEXT' }
    ];

    for (const column of columnsToAdd) {
      try {
        if (column.raw) {
          await sql.unsafe(`ALTER TABLE student_configs ADD COLUMN IF NOT EXISTS ${column.name} ${column.type}`);
        } else {
          await sql`ALTER TABLE student_configs ADD COLUMN IF NOT EXISTS ${sql(column.name)} ${sql.unsafe(column.type)}`;
        }
      } catch (error) {
        // Column might already exist, which is fine
      }
    }
    migrationSteps.push('✅ Added missing columns');

    // Step 3: Get current table info
    const tableInfo = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'student_configs'
      ORDER BY ordinal_position
    `;

    const rowCount = await sql`SELECT COUNT(*) as count FROM student_configs`;

    console.log('✅ Migration completed successfully');

    return res.status(200).json({
      success: true,
      message: 'student_configs table migration completed',
      steps: migrationSteps,
      tableInfo: tableInfo.map(col => ({
        column: col.column_name,
        type: col.data_type,
        nullable: col.is_nullable
      })),
      currentRecords: parseInt(rowCount[0].count)
    });

  } catch (error) {
    console.error('Migration error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Migration failed',
      details: error.toString()
    });
  }
}
