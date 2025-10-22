/**
 * Admin Migration: Change workshop_students to use session_token as primary key
 *
 * This migration changes the primary key from student_email to session_token,
 * allowing the same student to run the workshop multiple times with separate progress tracking.
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

    console.log('🔄 Running session primary key migration...');

    const migrationSteps = [];

    // Step 1: Check if we need to migrate
    const checkTable = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'workshop_students' AND column_name = 'session_token'
    `;

    if (checkTable.length > 0) {
      return res.status(200).json({
        success: true,
        message: 'Migration already completed - session_token column exists',
        steps: ['✅ Table already uses session_token as primary key']
      });
    }

    // Step 2: Create new table with correct schema
    await sql`
      CREATE TABLE IF NOT EXISTS workshop_sessions (
        session_token TEXT PRIMARY KEY,
        student_email TEXT NOT NULL,
        student_name TEXT,
        exercises JSONB DEFAULT '{}',
        bug_reports JSONB DEFAULT '[]',
        started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        total_time_spent INTEGER DEFAULT 0,
        completion_rate INTEGER DEFAULT 0,
        repo_created BOOLEAN DEFAULT FALSE,
        demo_mode BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    migrationSteps.push('✅ Created workshop_sessions table with session_token as primary key and bug_reports column');

    // Step 3: Migrate data from old table if it exists
    try {
      const oldData = await sql`SELECT * FROM workshop_students`;

      for (const row of oldData) {
        // Generate a session token for existing records (they don't have one)
        const legacySessionToken = `legacy-${row.student_email}-${Date.now()}`;

        await sql`
          INSERT INTO workshop_sessions
          (session_token, student_email, student_name, exercises, started_at, last_activity,
           total_time_spent, completion_rate, repo_created, demo_mode, created_at, updated_at)
          VALUES (
            ${legacySessionToken},
            ${row.student_email},
            ${row.student_name},
            ${row.exercises},
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

      migrationSteps.push(`✅ Migrated ${oldData.length} records from workshop_students to workshop_sessions`);
    } catch (error) {
      migrationSteps.push(`⚠️ Data migration: ${error.message} (table may not exist yet)`);
    }

    // Step 4: Rename old table to backup
    try {
      await sql`ALTER TABLE workshop_students RENAME TO workshop_students_backup`;
      migrationSteps.push('✅ Renamed workshop_students to workshop_students_backup');
    } catch (error) {
      migrationSteps.push(`⚠️ Backup rename: ${error.message}`);
    }

    // Step 5: Rename new table to workshop_students
    await sql`ALTER TABLE workshop_sessions RENAME TO workshop_students`;
    migrationSteps.push('✅ Renamed workshop_sessions to workshop_students');

    // Step 6: Create indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_email ON workshop_students(student_email)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON workshop_students(last_activity DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_completion ON workshop_students(completion_rate DESC)`;
    migrationSteps.push('✅ Created performance indexes');

    // Step 7: Create updated_at trigger
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

    // Step 8: Get new table info
    const tableInfo = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'workshop_students'
      ORDER BY ordinal_position
    `;

    const rowCount = await sql`SELECT COUNT(*) as count FROM workshop_students`;

    console.log('✅ Session primary key migration completed successfully');

    return res.status(200).json({
      success: true,
      message: 'Session primary key migration completed successfully',
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
