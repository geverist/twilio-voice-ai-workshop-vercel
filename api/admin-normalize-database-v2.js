/**
 * Admin Migration: Normalize Database Structure V2
 *
 * Creates a proper normalized schema:
 * 1. students - One record per student (student_id UUID as PK, email as unique)
 * 2. sessions - One record per session (session_token as PK, student_id as FK)
 * 3. step_progress - Individual step completion tracking
 *
 * Benefits:
 * - Students can change email addresses
 * - One student can have multiple sessions
 * - Proper relational integrity with UUIDs
 * - Better performance with indexed lookups
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

    console.log('🔄 Running database normalization V2 migration...');

    const migrationSteps = [];

    // Step 1: Check if migration already ran
    const checkStudentsV2 = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'students' AND column_name = 'student_id'
    `;

    if (checkStudentsV2.length > 0) {
      return res.status(200).json({
        success: true,
        message: 'Migration V2 already completed - normalized tables with student_id exist',
        steps: ['✅ Database already normalized with student_id']
      });
    }

    // Step 2: Enable UUID extension
    await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
    migrationSteps.push('✅ Enabled UUID extension');

    // Step 3: Create students table with UUID primary key
    await sql`
      CREATE TABLE IF NOT EXISTS students (
        student_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        student_email TEXT UNIQUE NOT NULL,
        student_name TEXT,
        twilio_account_sid TEXT,
        github_username TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    migrationSteps.push('✅ Created students table with UUID primary key');

    // Step 4: Create sessions table
    await sql`
      CREATE TABLE IF NOT EXISTS sessions (
        session_token TEXT PRIMARY KEY,
        student_id UUID NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,

        -- Session metadata
        started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '24 hours',
        is_active BOOLEAN DEFAULT TRUE,
        demo_mode BOOLEAN DEFAULT FALSE,

        -- Overall progress
        current_step INTEGER DEFAULT 0,
        total_time_spent INTEGER DEFAULT 0,
        completion_rate INTEGER DEFAULT 0,

        -- Workshop configuration
        use_case_description TEXT,
        call_direction TEXT,
        selected_phone_number TEXT,
        tts_provider TEXT,
        selected_voice TEXT,

        -- AI configuration
        openai_api_key TEXT,
        system_prompt TEXT,
        ivr_greeting TEXT,
        tools JSONB DEFAULT '[]',
        voice_settings JSONB DEFAULT '{}',

        -- Deployment URLs
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
    migrationSteps.push('✅ Created sessions table with student_id foreign key');

    // Step 5: Create step_progress table for granular tracking
    await sql`
      CREATE TABLE IF NOT EXISTS step_progress (
        id SERIAL PRIMARY KEY,
        session_token TEXT NOT NULL REFERENCES sessions(session_token) ON DELETE CASCADE,
        student_id UUID NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,

        -- Step identification
        step_number INTEGER NOT NULL,
        step_name TEXT NOT NULL,

        -- Progress tracking
        started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        completed_at TIMESTAMP WITH TIME ZONE,
        time_spent INTEGER DEFAULT 0,
        attempts INTEGER DEFAULT 0,
        validation_passed BOOLEAN DEFAULT FALSE,

        -- Code/work submitted
        code_submitted TEXT,
        deployment_url TEXT,

        -- Timestamps
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

        -- Unique constraint: one progress record per session per step
        UNIQUE(session_token, step_number)
      )
    `;
    migrationSteps.push('✅ Created step_progress table for granular tracking');

    // Step 6: Create events table for audit trail
    await sql`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        student_id UUID REFERENCES students(student_id) ON DELETE CASCADE,
        session_token TEXT REFERENCES sessions(session_token) ON DELETE CASCADE,

        event_type TEXT NOT NULL,
        event_data JSONB DEFAULT '{}',

        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    migrationSteps.push('✅ Created events table for audit trail');

    // Step 7: Migrate data from old tables
    try {
      // First, check which old table exists
      const oldTableCheck = await sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_name IN ('workshop_students', 'workshop_sessions')
      `;

      let migratedStudents = 0;
      let migratedSessions = 0;

      if (oldTableCheck.some(t => t.table_name === 'workshop_students')) {
        const existingData = await sql`SELECT * FROM workshop_students`;

        // Build a map of email -> student_id
        const emailToStudentId = {};

        // Extract and insert unique students
        const uniqueStudents = {};
        existingData.forEach(row => {
          const email = row.student_email || `unknown_${row.session_token}@example.com`;
          if (!uniqueStudents[email]) {
            uniqueStudents[email] = {
              email: email,
              name: row.student_name,
              created_at: row.created_at
            };
          }
        });

        // Insert students and capture their IDs
        for (const student of Object.values(uniqueStudents)) {
          const result = await sql`
            INSERT INTO students (student_email, student_name, created_at, updated_at)
            VALUES (${student.email}, ${student.name}, ${student.created_at || new Date()}, NOW())
            ON CONFLICT (student_email)
            DO UPDATE SET student_name = EXCLUDED.student_name
            RETURNING student_id, student_email
          `;
          emailToStudentId[student.email] = result[0].student_id;
          migratedStudents++;
        }
        migrationSteps.push(`✅ Migrated ${migratedStudents} unique students`);

        // Insert sessions
        for (const row of existingData) {
          const email = row.student_email || `unknown_${row.session_token}@example.com`;
          const studentId = emailToStudentId[email];

          if (!studentId) {
            console.error(`No student_id found for email: ${email}`);
            continue;
          }

          await sql`
            INSERT INTO sessions (
              session_token, student_id, started_at, last_activity,
              current_step, total_time_spent, completion_rate, demo_mode,
              use_case_description, call_direction, selected_phone_number,
              tts_provider, selected_voice, openai_api_key, system_prompt,
              ivr_greeting, tools, voice_settings, websocket_url, codespace_url,
              github_repo_url, railway_url, bug_reports, created_at, updated_at
            )
            VALUES (
              ${row.session_token}, ${studentId}, ${row.started_at || new Date()},
              ${row.last_activity || new Date()}, ${row.current_step || 0},
              ${row.total_time_spent || 0}, ${row.completion_rate || 0},
              ${row.demo_mode || false}, ${row.use_case_description}, ${row.call_direction},
              ${row.selected_phone_number}, ${row.tts_provider}, ${row.selected_voice},
              ${row.openai_api_key}, ${row.system_prompt}, ${row.ivr_greeting},
              ${row.tools || '[]'}, ${row.voice_settings || '{}'}, ${row.websocket_url},
              ${row.codespace_url}, ${row.github_repo_url}, ${row.railway_url},
              ${row.bug_reports || '[]'}, ${row.created_at || new Date()}, NOW()
            )
            ON CONFLICT (session_token) DO NOTHING
          `;
          migratedSessions++;

          // Migrate step progress from exercises JSONB if it exists
          if (row.exercises) {
            const exercises = typeof row.exercises === 'string'
              ? JSON.parse(row.exercises)
              : row.exercises;

            // Convert exercises object to step_progress records
            for (const [exerciseId, exerciseData] of Object.entries(exercises)) {
              // Extract step number from exercise ID (e.g., "step-1" -> 1)
              const stepMatch = exerciseId.match(/step-?(\d+)/i);
              const stepNumber = stepMatch ? parseInt(stepMatch[1]) : null;

              if (stepNumber !== null) {
                await sql`
                  INSERT INTO step_progress (
                    session_token, student_id, step_number, step_name,
                    started_at, completed_at, time_spent, attempts, validation_passed
                  )
                  VALUES (
                    ${row.session_token}, ${studentId}, ${stepNumber}, ${exerciseId},
                    ${row.started_at || new Date()},
                    ${exerciseData.completed ? exerciseData.timestamp : null},
                    ${exerciseData.timeSpent || 0},
                    ${exerciseData.attempts || 0},
                    ${exerciseData.completed || false}
                  )
                  ON CONFLICT (session_token, step_number) DO NOTHING
                `;
              }
            }
          }
        }
        migrationSteps.push(`✅ Migrated ${migratedSessions} sessions with step progress`);
      }

      // Check for workshop_sessions table (from auth-session.js)
      if (oldTableCheck.some(t => t.table_name === 'workshop_sessions')) {
        const authSessions = await sql`SELECT * FROM workshop_sessions`;

        for (const session of authSessions) {
          // Create or get student
          const studentResult = await sql`
            INSERT INTO students (student_email, student_name, twilio_account_sid)
            VALUES (
              ${session.student_id || `session_${session.session_id}@workshop.local`},
              'Workshop Student',
              ${session.account_sid}
            )
            ON CONFLICT (student_email) DO UPDATE SET
              twilio_account_sid = EXCLUDED.twilio_account_sid
            RETURNING student_id
          `;

          const studentId = studentResult[0].student_id;

          // Insert session
          await sql`
            INSERT INTO sessions (
              session_token, student_id, started_at, last_activity,
              expires_at, is_active, demo_mode, created_at
            )
            VALUES (
              ${session.session_id}, ${studentId}, ${session.created_at},
              ${session.last_activity}, ${session.expires_at}, TRUE,
              ${session.is_demo_mode || false}, ${session.created_at}
            )
            ON CONFLICT (session_token) DO NOTHING
          `;
        }
        migrationSteps.push(`✅ Migrated ${authSessions.length} auth sessions`);
      }

    } catch (error) {
      migrationSteps.push(`⚠️ Data migration: ${error.message}`);
      console.error('Migration error:', error);
    }

    // Step 8: Create indexes for performance
    await sql`CREATE INDEX IF NOT EXISTS idx_students_email ON students(student_email)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_student_id ON sessions(student_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON sessions(last_activity DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active, expires_at)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_step_progress_session ON step_progress(session_token)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_step_progress_student ON step_progress(student_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_events_student ON events(student_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_token)`;
    migrationSteps.push('✅ Created performance indexes');

    // Step 9: Create updated_at triggers
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

    await sql`DROP TRIGGER IF EXISTS update_step_progress_updated_at ON step_progress`;
    await sql`
      CREATE TRIGGER update_step_progress_updated_at
        BEFORE UPDATE ON step_progress
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column()
    `;
    migrationSteps.push('✅ Created updated_at triggers');

    // Step 10: Create helper function to update student progress
    await sql`
      CREATE OR REPLACE FUNCTION update_session_progress(p_session_token TEXT)
      RETURNS VOID AS $$
      DECLARE
        total_steps INTEGER := 9;
        completed_steps INTEGER;
        total_time INTEGER;
      BEGIN
        -- Count completed steps
        SELECT COUNT(*), COALESCE(SUM(time_spent), 0)
        INTO completed_steps, total_time
        FROM step_progress
        WHERE session_token = p_session_token
          AND validation_passed = TRUE;

        -- Update session
        UPDATE sessions
        SET
          completion_rate = ROUND((completed_steps::NUMERIC / total_steps) * 100),
          total_time_spent = total_time,
          last_activity = NOW()
        WHERE session_token = p_session_token;
      END;
      $$ LANGUAGE plpgsql
    `;
    migrationSteps.push('✅ Created helper function update_session_progress()');

    // Step 11: Get final counts
    const studentCount = await sql`SELECT COUNT(*) as count FROM students`;
    const sessionCount = await sql`SELECT COUNT(*) as count FROM sessions`;
    const stepProgressCount = await sql`SELECT COUNT(*) as count FROM step_progress`;

    console.log('✅ Database normalization V2 completed successfully');

    return res.status(200).json({
      success: true,
      message: 'Database normalized successfully with student_id as primary key',
      steps: migrationSteps,
      stats: {
        students: parseInt(studentCount[0].count),
        sessions: parseInt(sessionCount[0].count),
        stepProgress: parseInt(stepProgressCount[0].count)
      },
      schema: {
        students: {
          primary_key: 'student_id (UUID)',
          unique: 'student_email',
          indexes: ['student_email']
        },
        sessions: {
          primary_key: 'session_token',
          foreign_key: 'student_id -> students.student_id',
          indexes: ['student_id', 'last_activity', 'is_active+expires_at']
        },
        step_progress: {
          primary_key: 'id (SERIAL)',
          foreign_keys: ['session_token -> sessions', 'student_id -> students'],
          unique: 'session_token + step_number',
          indexes: ['session_token', 'student_id']
        }
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
