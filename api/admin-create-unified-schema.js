/**
 * Create Unified Database Schema V2
 *
 * This migration creates a clean, normalized database schema that consolidates
 * all student session data into a single, consistent structure.
 *
 * IMPORTANT: Run this ONCE to create the new schema. Then use the migration
 * script to copy data from old tables.
 *
 * Tables Created:
 * 1. students - Master student records (UUID-based)
 * 2. sessions - All session data and progress in ONE table
 * 3. step_progress - Granular step-by-step tracking (optional)
 * 4. events - Audit trail (optional)
 */

import postgres from 'postgres';
import { applyCORS, handlePreflightRequest } from './_lib/cors.js';

const sql = postgres(process.env.POSTGRES_URL, {
  ssl: 'require',
  max: 1
});

export default async function handler(req, res) {
  applyCORS(req, res);

  if (handlePreflightRequest(req, res)) {
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { adminPassword, dropExisting } = req.body;

    // Authentication
    if (!process.env.ADMIN_PASSWORD || adminPassword !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ success: false, error: 'Invalid admin password' });
    }

    const results = [];

    // Optional: Drop existing V2 tables if requested
    if (dropExisting === true) {
      console.log('⚠️  Dropping existing V2 tables...');

      await sql`DROP TABLE IF EXISTS events CASCADE`;
      await sql`DROP TABLE IF EXISTS step_progress CASCADE`;
      await sql`DROP TABLE IF EXISTS sessions CASCADE`;
      await sql`DROP TABLE IF EXISTS students CASCADE`;

      results.push('✅ Dropped existing V2 tables');
    }

    // Enable UUID extension
    await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
    results.push('✅ UUID extension enabled');

    // 1. Create students table (master records)
    await sql`
      CREATE TABLE IF NOT EXISTS students (
        student_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        student_email TEXT UNIQUE NOT NULL,
        student_name TEXT,
        github_username TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    results.push('✅ Created students table');

    // Add indexes on students
    await sql`CREATE INDEX IF NOT EXISTS idx_students_email ON students(student_email)`;
    results.push('✅ Added index on students.student_email');

    // 2. Create sessions table (ALL session data in ONE table)
    await sql`
      CREATE TABLE IF NOT EXISTS sessions (
        session_token TEXT PRIMARY KEY,
        student_id UUID NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,

        -- Session metadata
        started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '30 days',
        is_active BOOLEAN DEFAULT TRUE,
        demo_mode BOOLEAN DEFAULT FALSE,

        -- Workshop configuration
        use_case_description TEXT,
        call_direction TEXT,
        selected_phone_number TEXT,
        tts_provider TEXT,
        selected_voice TEXT,

        -- AI configuration (encrypted at application layer)
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

        -- Overall progress tracking
        current_step INTEGER DEFAULT 0,
        total_time_spent INTEGER DEFAULT 0,
        completion_rate INTEGER DEFAULT 0,

        -- Step 1: Connect Accounts
        twilio_connected BOOLEAN DEFAULT FALSE,
        openai_connected BOOLEAN DEFAULT FALSE,

        -- Step 2: Choose Use Case
        call_direction_chosen BOOLEAN DEFAULT FALSE,

        -- Step 3: Provision Services
        services_ready BOOLEAN DEFAULT FALSE,

        -- Step 4: Basic TwiML
        step4_code_validated BOOLEAN DEFAULT FALSE,
        step4_committed BOOLEAN DEFAULT FALSE,
        step4_deployed BOOLEAN DEFAULT FALSE,

        -- Step 5: WebSocket Handler
        step5_code_validated BOOLEAN DEFAULT FALSE,
        step5_committed BOOLEAN DEFAULT FALSE,
        step5_deployed BOOLEAN DEFAULT FALSE,

        -- Step 6: ConversationRelay
        step6_code_validated BOOLEAN DEFAULT FALSE,
        step6_committed BOOLEAN DEFAULT FALSE,
        step6_deployed BOOLEAN DEFAULT FALSE,

        -- Step 7: Prompt Engineering
        system_prompt_saved BOOLEAN DEFAULT FALSE,
        step7_committed BOOLEAN DEFAULT FALSE,
        step7_deployed BOOLEAN DEFAULT FALSE,

        -- Step 8: Tools & Functions
        tools_configured BOOLEAN DEFAULT FALSE,
        step8_code_validated BOOLEAN DEFAULT FALSE,
        step8_committed BOOLEAN DEFAULT FALSE,
        step8_deployed BOOLEAN DEFAULT FALSE,

        -- Step 9: Deploy System
        project_deployed BOOLEAN DEFAULT FALSE,

        -- Legacy: JSONB exercises field for backward compatibility
        exercises JSONB DEFAULT '{}',

        -- Bug tracking
        bug_reports JSONB DEFAULT '[]',

        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    results.push('✅ Created sessions table with ALL fields');

    // Add indexes on sessions
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_student ON sessions(student_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_activity ON sessions(last_activity DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active, expires_at)`;
    results.push('✅ Added indexes on sessions table');

    // 3. Create step_progress table (optional - for granular tracking)
    await sql`
      CREATE TABLE IF NOT EXISTS step_progress (
        id SERIAL PRIMARY KEY,
        session_token TEXT NOT NULL REFERENCES sessions(session_token) ON DELETE CASCADE,
        student_id UUID NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,

        step_number INTEGER NOT NULL,
        step_name TEXT NOT NULL,

        started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        completed_at TIMESTAMP WITH TIME ZONE,
        time_spent INTEGER DEFAULT 0,
        attempts INTEGER DEFAULT 0,
        validation_passed BOOLEAN DEFAULT FALSE,

        code_submitted TEXT,
        deployment_url TEXT,

        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

        UNIQUE(session_token, step_number)
      )
    `;
    results.push('✅ Created step_progress table');

    // Add indexes on step_progress
    await sql`CREATE INDEX IF NOT EXISTS idx_step_progress_session ON step_progress(session_token)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_step_progress_student ON step_progress(student_id)`;
    results.push('✅ Added indexes on step_progress table');

    // 4. Create events table (audit trail)
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
    results.push('✅ Created events table');

    // Add indexes on events
    await sql`CREATE INDEX IF NOT EXISTS idx_events_student ON events(student_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_token)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)`;
    results.push('✅ Added indexes on events table');

    // 5. Create updated_at trigger function
    await sql`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `;
    results.push('✅ Created updated_at trigger function');

    // 6. Add triggers to auto-update updated_at
    await sql`
      DROP TRIGGER IF EXISTS update_students_updated_at ON students;
      CREATE TRIGGER update_students_updated_at
        BEFORE UPDATE ON students
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column()
    `;

    await sql`
      DROP TRIGGER IF EXISTS update_sessions_updated_at ON sessions;
      CREATE TRIGGER update_sessions_updated_at
        BEFORE UPDATE ON sessions
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column()
    `;

    await sql`
      DROP TRIGGER IF EXISTS update_step_progress_updated_at ON step_progress;
      CREATE TRIGGER update_step_progress_updated_at
        BEFORE UPDATE ON step_progress
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column()
    `;
    results.push('✅ Added updated_at triggers to all tables');

    // 7. Create helper function to update session progress
    await sql`
      CREATE OR REPLACE FUNCTION update_session_progress(p_session_token TEXT)
      RETURNS VOID AS $$
      DECLARE
        total_steps INTEGER := 9;
        completed_steps INTEGER;
      BEGIN
        -- Count completed steps based on boolean flags
        SELECT (
          CASE WHEN twilio_connected AND openai_connected THEN 1 ELSE 0 END +
          CASE WHEN call_direction_chosen THEN 1 ELSE 0 END +
          CASE WHEN services_ready THEN 1 ELSE 0 END +
          CASE WHEN step4_deployed THEN 1 ELSE 0 END +
          CASE WHEN step5_deployed THEN 1 ELSE 0 END +
          CASE WHEN step6_deployed THEN 1 ELSE 0 END +
          CASE WHEN system_prompt_saved THEN 1 ELSE 0 END +
          CASE WHEN step8_deployed THEN 1 ELSE 0 END +
          CASE WHEN project_deployed THEN 1 ELSE 0 END
        )
        INTO completed_steps
        FROM sessions
        WHERE session_token = p_session_token;

        -- Update completion rate
        UPDATE sessions
        SET
          completion_rate = ROUND((completed_steps::NUMERIC / total_steps) * 100),
          last_activity = NOW()
        WHERE session_token = p_session_token;
      END;
      $$ LANGUAGE plpgsql
    `;
    results.push('✅ Created update_session_progress() helper function');

    // Success!
    return res.status(200).json({
      success: true,
      message: 'Unified database schema created successfully',
      results,
      nextSteps: [
        '1. Run /api/admin-migrate-to-unified-schema to copy data from old tables',
        '2. Update API endpoints to use new schema',
        '3. Test instructor dashboard with new schema',
        '4. Once verified, backup and drop old tables'
      ]
    });

  } catch (error) {
    console.error('Schema creation error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      details: error.stack
    });
  }
}
