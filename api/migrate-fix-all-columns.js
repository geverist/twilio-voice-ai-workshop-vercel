/**
 * Database Migration: Fix all missing columns in student_configs
 *
 * The tests discovered that the student_configs table is missing many columns
 * that are defined in the CREATE TABLE statement but were never added because
 * CREATE TABLE IF NOT EXISTS doesn't add columns to existing tables.
 *
 * This migration adds ALL missing columns safely.
 *
 * POST /api/migrate-fix-all-columns
 * Body: { adminPassword: string }
 */

import postgres from 'postgres';
import { applyCORS, handlePreflightRequest } from './_lib/cors.js';

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
      console.warn('⚠️ Unauthorized migration attempt');
      return res.status(401).json({
        success: false,
        error: 'Invalid admin password'
      });
    }

    console.log('🔧 Starting migration: Fix all missing columns in student_configs');

    // Get all existing columns
    const existingColumns = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'student_configs'
    `;

    const existingColumnNames = existingColumns.map(col => col.column_name);
    console.log('📋 Existing columns:', existingColumnNames);

    // Define all columns that should exist
    const requiredColumns = [
      { name: 'session_token', type: 'TEXT PRIMARY KEY' },
      { name: 'student_name', type: 'TEXT' },
      { name: 'student_email', type: 'TEXT' },
      { name: 'openai_api_key', type: 'TEXT' },
      { name: 'system_prompt', type: 'TEXT' },
      { name: 'tools', type: 'JSONB DEFAULT \'[]\'::jsonb' },
      { name: 'voice_settings', type: 'JSONB DEFAULT \'{}\'::jsonb' },
      { name: 'use_case_description', type: 'TEXT' },
      { name: 'call_direction', type: 'TEXT' },
      { name: 'ivr_greeting', type: 'TEXT' },
      { name: 'tts_provider', type: 'TEXT' },
      { name: 'selected_voice', type: 'TEXT' },
      { name: 'selected_phone_number', type: 'TEXT' },
      { name: 'websocket_url', type: 'TEXT' },
      { name: 'codespace_url', type: 'TEXT' },
      { name: 'github_repo_url', type: 'TEXT' },
      { name: 'railway_url', type: 'TEXT' },
      { name: 'current_step', type: 'INTEGER DEFAULT 0' },
      { name: 'twilio_connected', type: 'BOOLEAN DEFAULT false' },
      { name: 'openai_connected', type: 'BOOLEAN DEFAULT false' },
      { name: 'call_direction_chosen', type: 'BOOLEAN DEFAULT false' },
      { name: 'services_ready', type: 'BOOLEAN DEFAULT false' },
      { name: 'step4_code_validated', type: 'BOOLEAN DEFAULT false' },
      { name: 'step4_committed', type: 'BOOLEAN DEFAULT false' },
      { name: 'step4_deployed', type: 'BOOLEAN DEFAULT false' },
      { name: 'step5_code_validated', type: 'BOOLEAN DEFAULT false' },
      { name: 'step5_committed', type: 'BOOLEAN DEFAULT false' },
      { name: 'step5_deployed', type: 'BOOLEAN DEFAULT false' },
      { name: 'step6_code_validated', type: 'BOOLEAN DEFAULT false' },
      { name: 'step6_committed', type: 'BOOLEAN DEFAULT false' },
      { name: 'step6_deployed', type: 'BOOLEAN DEFAULT false' },
      { name: 'system_prompt_saved', type: 'BOOLEAN DEFAULT false' },
      { name: 'step7_committed', type: 'BOOLEAN DEFAULT false' },
      { name: 'step7_deployed', type: 'BOOLEAN DEFAULT false' },
      { name: 'tools_configured', type: 'BOOLEAN DEFAULT false' },
      { name: 'step8_code_validated', type: 'BOOLEAN DEFAULT false' },
      { name: 'step8_committed', type: 'BOOLEAN DEFAULT false' },
      { name: 'step8_deployed', type: 'BOOLEAN DEFAULT false' },
      { name: 'project_deployed', type: 'BOOLEAN DEFAULT false' },
      { name: 'created_at', type: 'TIMESTAMP DEFAULT NOW()' },
      { name: 'updated_at', type: 'TIMESTAMP DEFAULT NOW()' }
    ];

    // Find missing columns
    const missingColumns = requiredColumns.filter(
      col => !existingColumnNames.includes(col.name) && col.name !== 'session_token'
    );

    if (missingColumns.length === 0) {
      console.log('✅ All columns already exist - no migration needed');
      return res.status(200).json({
        success: true,
        message: 'All columns already exist - no migration needed',
        alreadyComplete: true,
        existingColumns: existingColumnNames
      });
    }

    console.log(`📝 Adding ${missingColumns.length} missing columns:`, missingColumns.map(c => c.name));

    // Add each missing column
    const addedColumns = [];
    const errors = [];

    for (const column of missingColumns) {
      try {
        // Use unsafe to construct dynamic ALTER TABLE statements
        await sql.unsafe(`ALTER TABLE student_configs ADD COLUMN IF NOT EXISTS ${column.name} ${column.type}`);
        addedColumns.push(column.name);
        console.log(`  ✅ Added column: ${column.name}`);
      } catch (error) {
        console.error(`  ❌ Failed to add column ${column.name}:`, error.message);
        errors.push({ column: column.name, error: error.message });
      }
    }

    // Verify columns were added
    const verifyColumns = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'student_configs'
    `;

    const finalColumnNames = verifyColumns.map(col => col.column_name);
    console.log('📋 Final columns:', finalColumnNames);

    console.log(`✅ Migration complete: Added ${addedColumns.length} columns`);

    return res.status(200).json({
      success: true,
      message: `Migration complete: Added ${addedColumns.length} missing columns to student_configs table`,
      details: {
        tableName: 'student_configs',
        columnsAdded: addedColumns,
        columnsAddedCount: addedColumns.length,
        errors: errors.length > 0 ? errors : undefined,
        finalColumns: finalColumnNames
      }
    });

  } catch (error) {
    console.error('Migration error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Migration failed',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
