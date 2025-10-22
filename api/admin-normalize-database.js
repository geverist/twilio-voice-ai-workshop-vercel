/**
 * Admin Migration: Normalize Database Structure
 *
 * Splits the denormalized workshop_students table into two normalized tables:
 * 1. students - One record per student (email as PK)
 * 2. sessions - One record per session (session_token as PK, student_email as FK)
 *
 * This allows:
 * - One student to have multiple sessions
 * - Orphaned student records (students with no sessions)
 * - Deleting individual sessions without deleting the student
 * - Deleting students (cascades to all their sessions)
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

    // Authentication
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

    console.log('🔄 Running database normalization migration...');

    const migrationSteps = [];

    // Step 1: Check if migration already ran
    const checkStudents = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'students'
    `;

    const checkSessions = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'sessions'
    `;

    if (checkStudents.length > 0 && checkSessions.length > 0) {
      return res.status(200).json({
        success: true,
        message: 'Migration already completed - normalized tables exist',
        steps: ['✅ Database already normalized']
      });
    }

    // Step 2: Create students table
    await sql`
      CREATE TABLE IF NOT EXISTS students (
        student_email TEXT PRIMARY KEY,
        student_name TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    migrationSteps.push('✅ Created students table');

    // Step 3: Create sessions table
    await sql`
      CREATE TABLE IF NOT EXISTS sessions (
        session_token TEXT PRIMARY KEY,
        student_email TEXT NOT NULL REFERENCES students(student_email) ON DELETE CASCADE,

        -- Progress tracking
        exercises JSONB DEFAULT '{}',
        started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        total_time_spent INTEGER DEFAULT 0,
        completion_rate INTEGER DEFAULT 0,
        repo_created BOOLEAN DEFAULT FALSE,
        demo_mode BOOLEAN DEFAULT FALSE,

        -- Configuration
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
    migrationSteps.push('✅ Created sessions table with foreign key to students');

    // Step 4: Migrate data from workshop_students
    try {
      const existingData = await sql`SELECT * FROM workshop_students`;

      // Extract unique students
      const uniqueStudents = {};
      existingData.forEach(row => {
        const email = row.student_email;
        if (!uniqueStudents[email]) {
          uniqueStudents[email] = {
            email: email,
            name: row.student_name,
            created_at: row.created_at,
            updated_at: row.updated_at
          };
        }
      });

      // Insert students
      for (const student of Object.values(uniqueStudents)) {
        await sql`
          INSERT INTO students (student_email, student_name, created_at, updated_at)
          VALUES (${student.email}, ${student.name}, ${student.created_at}, ${student.updated_at})
          ON CONFLICT (student_email) DO NOTHING
        `;
      }
      migrationSteps.push(`✅ Migrated ${Object.keys(uniqueStudents).length} unique students`);

      // Insert sessions
      for (const row of existingData) {
        await sql`
          INSERT INTO sessions (
            session_token, student_email, exercises, started_at, last_activity,
            total_time_spent, completion_rate, repo_created, demo_mode,
            openai_api_key, system_prompt, tools, voice_settings,
            use_case_description, call_direction, ivr_greeting, tts_provider,
            selected_voice, selected_phone_number, websocket_url, codespace_url,
            github_repo_url, railway_url, bug_reports, created_at, updated_at
          )
          VALUES (
            ${row.session_token}, ${row.student_email}, ${row.exercises || '{}'},
            ${row.started_at}, ${row.last_activity}, ${row.total_time_spent || 0},
            ${row.completion_rate || 0}, ${row.repo_created || false}, ${row.demo_mode || false},
            ${row.openai_api_key}, ${row.system_prompt}, ${row.tools || '[]'},
            ${row.voice_settings || '{}'}, ${row.use_case_description}, ${row.call_direction},
            ${row.ivr_greeting}, ${row.tts_provider}, ${row.selected_voice},
            ${row.selected_phone_number}, ${row.websocket_url}, ${row.codespace_url},
            ${row.github_repo_url}, ${row.railway_url}, ${row.bug_reports || '[]'},
            ${row.created_at}, ${row.updated_at}
          )
          ON CONFLICT (session_token) DO NOTHING
        `;
      }
      migrationSteps.push(`✅ Migrated ${existingData.length} sessions`);

    } catch (error) {
      migrationSteps.push(`⚠️ Data migration: ${error.message} (old table may not exist)`);
    }

    // Step 5: Backup old table
    try {
      await sql`ALTER TABLE workshop_students RENAME TO workshop_students_backup_${Date.now()}`;
      migrationSteps.push('✅ Backed up workshop_students table');
    } catch (error) {
      migrationSteps.push(`⚠️ Backup: ${error.message}`);
    }

    // Step 6: Create indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_student_email ON sessions(student_email)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON sessions(last_activity DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_completion ON sessions(completion_rate DESC)`;
    migrationSteps.push('✅ Created performance indexes');

    // Step 7: Create updated_at triggers
    await sql`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `;

    await sql`DROP TRIGGER IF EXISTS update_students_updated_at ON students`;
    await sql`
      CREATE TRIGGER update_students_updated_at
        BEFORE UPDATE ON students
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column()
    `;

    await sql`DROP TRIGGER IF EXISTS update_sessions_updated_at ON sessions`;
    await sql`
      CREATE TRIGGER update_sessions_updated_at
        BEFORE UPDATE ON sessions
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column()
    `;
    migrationSteps.push('✅ Created updated_at triggers');

    // Step 8: Get final counts
    const studentCount = await sql`SELECT COUNT(*) as count FROM students`;
    const sessionCount = await sql`SELECT COUNT(*) as count FROM sessions`;

    console.log('✅ Database normalization completed successfully');

    return res.status(200).json({
      success: true,
      message: 'Database normalized successfully',
      steps: migrationSteps,
      stats: {
        students: parseInt(studentCount[0].count),
        sessions: parseInt(sessionCount[0].count)
      }
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
