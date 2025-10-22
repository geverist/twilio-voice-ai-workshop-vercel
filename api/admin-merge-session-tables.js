/**
 * Admin Migration: Merge student_configs and workshop_students tables
 *
 * This migration combines the two separate tables into a single unified
 * workshop_sessions table where each session contains both config and progress.
 *
 * Safe to run multiple times - checks if migration is needed before executing.
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

    console.log('🔄 Running table merge migration...');

    const migrationSteps = [];

    // Step 1: Check if we need to migrate
    const checkNewTable = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'workshop_sessions_merged'
    `;

    if (checkNewTable.length > 0) {
      return res.status(200).json({
        success: true,
        message: 'Migration already completed - merged table exists',
        steps: ['✅ Tables already merged into workshop_sessions']
      });
    }

    // Step 2: Create new unified table
    await sql`
      CREATE TABLE IF NOT EXISTS workshop_sessions_merged (
        session_token TEXT PRIMARY KEY,
        student_email TEXT NOT NULL,
        student_name TEXT,

        -- Progress tracking (from workshop_students)
        exercises JSONB DEFAULT '{}',
        started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        total_time_spent INTEGER DEFAULT 0,
        completion_rate INTEGER DEFAULT 0,
        repo_created BOOLEAN DEFAULT FALSE,
        demo_mode BOOLEAN DEFAULT FALSE,

        -- Configuration (from student_configs)
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

        -- Bug tracking
        bug_reports JSONB DEFAULT '[]',

        -- Timestamps
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    migrationSteps.push('✅ Created unified workshop_sessions_merged table');

    // Step 3: Migrate data from workshop_students (progress tracking)
    try {
      const progressData = await sql`SELECT * FROM workshop_students`;

      for (const row of progressData) {
        await sql`
          INSERT INTO workshop_sessions_merged
          (session_token, student_email, student_name, exercises, started_at, last_activity,
           total_time_spent, completion_rate, repo_created, demo_mode, created_at, updated_at)
          VALUES (
            ${row.session_token},
            ${row.student_email},
            ${row.student_name},
            ${row.exercises || '{}'},
            ${row.started_at},
            ${row.last_activity},
            ${row.total_time_spent || 0},
            ${row.completion_rate || 0},
            ${row.repo_created || false},
            ${row.demo_mode || false},
            ${row.created_at || new Date()},
            ${row.updated_at || new Date()}
          )
          ON CONFLICT (session_token) DO NOTHING
        `;
      }
      migrationSteps.push(`✅ Migrated ${progressData.length} progress records from workshop_students`);
    } catch (error) {
      migrationSteps.push(`⚠️ Progress migration: ${error.message} (table may not exist yet)`);
    }

    // Step 4: Merge data from student_configs (configurations)
    try {
      const configData = await sql`SELECT * FROM student_configs`;

      for (const row of configData) {
        // Check if session already exists (from progress table)
        const existing = await sql`
          SELECT * FROM workshop_sessions_merged
          WHERE session_token = ${row.session_token}
        `;

        if (existing.length > 0) {
          // Update existing record with config data
          await sql`
            UPDATE workshop_sessions_merged
            SET
              student_name = COALESCE(${row.student_name}, student_name),
              openai_api_key = ${row.openai_api_key},
              system_prompt = ${row.system_prompt},
              tools = ${row.tools || '[]'},
              voice_settings = ${row.voice_settings || '{}'},
              use_case_description = ${row.use_case_description},
              call_direction = ${row.call_direction},
              ivr_greeting = ${row.ivr_greeting},
              tts_provider = ${row.tts_provider},
              selected_voice = ${row.selected_voice},
              selected_phone_number = ${row.selected_phone_number},
              websocket_url = ${row.websocket_url},
              codespace_url = ${row.codespace_url},
              github_repo_url = ${row.github_repo_url},
              railway_url = ${row.railway_url},
              updated_at = ${row.updated_at || new Date()}
            WHERE session_token = ${row.session_token}
          `;
        } else {
          // Insert new record (config-only session with no progress yet)
          await sql`
            INSERT INTO workshop_sessions_merged
            (session_token, student_email, student_name, openai_api_key, system_prompt, tools,
             voice_settings, use_case_description, call_direction, ivr_greeting, tts_provider,
             selected_voice, selected_phone_number, websocket_url, codespace_url, github_repo_url,
             railway_url, created_at, updated_at)
            VALUES (
              ${row.session_token},
              ${'unknown@example.com'}, -- Config table doesn't have email, will be updated on first progress track
              ${row.student_name},
              ${row.openai_api_key},
              ${row.system_prompt},
              ${row.tools || '[]'},
              ${row.voice_settings || '{}'},
              ${row.use_case_description},
              ${row.call_direction},
              ${row.ivr_greeting},
              ${row.tts_provider},
              ${row.selected_voice},
              ${row.selected_phone_number},
              ${row.websocket_url},
              ${row.codespace_url},
              ${row.github_repo_url},
              ${row.railway_url},
              ${row.created_at || new Date()},
              ${row.updated_at || new Date()}
            )
            ON CONFLICT (session_token) DO NOTHING
          `;
        }
      }
      migrationSteps.push(`✅ Merged ${configData.length} config records from student_configs`);
    } catch (error) {
      migrationSteps.push(`⚠️ Config migration: ${error.message} (table may not exist yet)`);
    }

    // Step 5: Backup old tables
    try {
      await sql`ALTER TABLE workshop_students RENAME TO workshop_students_backup_${Date.now()}`;
      migrationSteps.push('✅ Backed up workshop_students table');
    } catch (error) {
      migrationSteps.push(`⚠️ Backup workshop_students: ${error.message}`);
    }

    try {
      await sql`ALTER TABLE student_configs RENAME TO student_configs_backup_${Date.now()}`;
      migrationSteps.push('✅ Backed up student_configs table');
    } catch (error) {
      migrationSteps.push(`⚠️ Backup student_configs: ${error.message}`);
    }

    // Step 6: Rename merged table to workshop_students
    await sql`ALTER TABLE workshop_sessions_merged RENAME TO workshop_students`;
    migrationSteps.push('✅ Renamed merged table to workshop_students');

    // Step 7: Create indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_students_email ON workshop_students(student_email)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_students_last_activity ON workshop_students(last_activity DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_students_completion ON workshop_students(completion_rate DESC)`;
    migrationSteps.push('✅ Created performance indexes');

    // Step 8: Create updated_at trigger
    await sql`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `;

    await sql`DROP TRIGGER IF EXISTS update_workshop_students_updated_at ON workshop_students`;

    await sql`
      CREATE TRIGGER update_workshop_students_updated_at
        BEFORE UPDATE ON workshop_students
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column()
    `;
    migrationSteps.push('✅ Created updated_at trigger');

    // Step 9: Get new table info
    const tableInfo = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'workshop_students'
      ORDER BY ordinal_position
    `;

    const rowCount = await sql`SELECT COUNT(*) as count FROM workshop_students`;

    console.log('✅ Table merge migration completed successfully');

    return res.status(200).json({
      success: true,
      message: 'Table merge migration completed successfully',
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
