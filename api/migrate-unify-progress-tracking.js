/**
 * Migration: Unify Progress Tracking
 *
 * Consolidates two competing progress tracking systems:
 * - OLD: workshop_students with JSONB exercises column
 * - NEW: workshop_sessions + workshop_step_progress (normalized)
 *
 * This migration:
 * 1. Creates the unified schema (workshop_sessions, workshop_step_progress, workshop_events)
 * 2. Migrates data from workshop_students to the new schema
 * 3. Preserves all existing progress data
 * 4. Adds necessary indexes
 *
 * POST /api/migrate-unify-progress-tracking
 * Body: { adminPassword: string, executeChanges: boolean }
 */

import { sql } from '@vercel/postgres';
import crypto from 'crypto';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { adminPassword, executeChanges = false } = req.body;

    // Authentication
    if (!process.env.ADMIN_PASSWORD) {
      return res.status(500).json({
        success: false,
        error: 'ADMIN_PASSWORD not configured'
      });
    }

    if (!adminPassword || adminPassword !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({
        success: false,
        error: 'Invalid admin password'
      });
    }

    console.log('🔄 Starting progress tracking unification migration...');
    console.log(`Mode: ${executeChanges ? 'EXECUTE' : 'DRY RUN'}`);

    const migrationLog = [];
    const dryRunResults = {
      studentsToMigrate: 0,
      exercisesToMigrate: 0,
      sessionsToCreate: 0,
      stepsToCreate: 0
    };

    // STEP 1: Create new unified schema
    migrationLog.push('━━━ STEP 1: Creating Unified Schema ━━━');

    if (executeChanges) {
      // Create workshop_sessions table
      await sql`
        CREATE TABLE IF NOT EXISTS workshop_sessions (
          session_id TEXT PRIMARY KEY,
          student_id TEXT NOT NULL,
          account_sid TEXT,
          auth_token TEXT,
          api_key_sid TEXT,
          api_key_secret TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          expires_at TIMESTAMP,
          last_activity TIMESTAMP DEFAULT NOW(),
          is_demo_mode BOOLEAN DEFAULT FALSE
        )
      `;
      migrationLog.push('✅ Created workshop_sessions table');

      // Create workshop_step_progress table
      await sql`
        CREATE TABLE IF NOT EXISTS workshop_step_progress (
          id SERIAL PRIMARY KEY,
          student_id TEXT NOT NULL,
          step_number INTEGER NOT NULL,
          step_name TEXT,
          started_at TIMESTAMP DEFAULT NOW(),
          completed_at TIMESTAMP,
          time_spent INTEGER DEFAULT 0,
          attempts INTEGER DEFAULT 1,
          validation_passed BOOLEAN DEFAULT FALSE,
          code_submitted TEXT,
          UNIQUE(student_id, step_number)
        )
      `;
      migrationLog.push('✅ Created workshop_step_progress table');

      // Create workshop_events table for audit log
      await sql`
        CREATE TABLE IF NOT EXISTS workshop_events (
          id SERIAL PRIMARY KEY,
          student_id TEXT NOT NULL,
          session_id TEXT,
          event_type TEXT NOT NULL,
          event_data JSONB,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `;
      migrationLog.push('✅ Created workshop_events table');

      // Add indexes
      await sql`CREATE INDEX IF NOT EXISTS idx_sessions_student ON workshop_sessions(student_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON workshop_sessions(expires_at)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_step_progress_student ON workshop_step_progress(student_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_step_progress_step ON workshop_step_progress(step_number)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_events_student ON workshop_events(student_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_events_session ON workshop_events(session_id)`;
      migrationLog.push('✅ Created indexes');
    } else {
      migrationLog.push('🔍 DRY RUN: Would create workshop_sessions, workshop_step_progress, workshop_events tables');
    }

    // STEP 2: Analyze existing workshop_students data
    migrationLog.push('\n━━━ STEP 2: Analyzing Existing Data ━━━');

    const existingStudents = await sql`
      SELECT
        session_token,
        student_email,
        student_name,
        exercises,
        started_at,
        last_activity,
        total_time_spent,
        repo_created,
        demo_mode
      FROM workshop_students
      WHERE session_token IS NOT NULL
    `;

    dryRunResults.studentsToMigrate = existingStudents.rows.length;
    migrationLog.push(`📊 Found ${existingStudents.rows.length} students to migrate`);

    // STEP 3: Migrate data
    migrationLog.push('\n━━━ STEP 3: Migrating Student Data ━━━');

    let totalExercisesMigrated = 0;
    let totalSessionsCreated = 0;
    let totalStepsCreated = 0;

    for (const student of existingStudents.rows) {
      const studentId = student.student_email;
      const sessionToken = student.session_token;
      const exercises = student.exercises || {};

      // Count exercises for this student
      const exerciseCount = Object.keys(exercises).length;
      totalExercisesMigrated += exerciseCount;

      if (executeChanges) {
        // Create session entry
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

        await sql`
          INSERT INTO workshop_sessions (
            session_id,
            student_id,
            created_at,
            expires_at,
            last_activity,
            is_demo_mode
          ) VALUES (
            ${sessionToken},
            ${studentId},
            ${student.started_at || new Date()},
            ${expiresAt},
            ${student.last_activity || new Date()},
            ${student.demo_mode || false}
          )
          ON CONFLICT (session_id) DO UPDATE SET
            last_activity = EXCLUDED.last_activity
        `;
        totalSessionsCreated++;

        // Migrate each exercise to workshop_step_progress
        for (const [exerciseId, exerciseData] of Object.entries(exercises)) {
          // Parse exercise ID to get step number (e.g., "step-1" -> 1, "exercise-1" -> 1)
          const stepNumberMatch = exerciseId.match(/(\d+)/);
          const stepNumber = stepNumberMatch ? parseInt(stepNumberMatch[1]) : 0;

          await sql`
            INSERT INTO workshop_step_progress (
              student_id,
              step_number,
              step_name,
              started_at,
              completed_at,
              time_spent,
              attempts,
              validation_passed
            ) VALUES (
              ${studentId},
              ${stepNumber},
              ${exerciseId},
              ${exerciseData.lastAttempt || student.started_at},
              ${exerciseData.completed ? (exerciseData.timestamp || new Date()) : null},
              ${exerciseData.timeSpent || 0},
              ${exerciseData.attempts || 1},
              ${exerciseData.completed || false}
            )
            ON CONFLICT (student_id, step_number) DO UPDATE SET
              completed_at = EXCLUDED.completed_at,
              time_spent = workshop_step_progress.time_spent + EXCLUDED.time_spent,
              attempts = workshop_step_progress.attempts + EXCLUDED.attempts,
              validation_passed = EXCLUDED.validation_passed OR workshop_step_progress.validation_passed
          `;
          totalStepsCreated++;
        }

        // Log migration event
        await sql`
          INSERT INTO workshop_events (
            student_id,
            session_id,
            event_type,
            event_data,
            created_at
          ) VALUES (
            ${studentId},
            ${sessionToken},
            'data_migrated',
            ${JSON.stringify({
              source: 'workshop_students',
              exercisesMigrated: exerciseCount,
              migratedAt: new Date().toISOString()
            })},
            NOW()
          )
        `;

        migrationLog.push(`  ✅ Migrated ${studentId}: ${exerciseCount} exercises → ${exerciseCount} steps`);
      } else {
        migrationLog.push(`  🔍 Would migrate ${studentId}: ${exerciseCount} exercises → ${exerciseCount} steps`);
      }
    }

    dryRunResults.exercisesToMigrate = totalExercisesMigrated;
    dryRunResults.sessionsToCreate = totalSessionsCreated;
    dryRunResults.stepsToCreate = totalStepsCreated;

    if (executeChanges) {
      migrationLog.push(`\n✅ Migrated ${totalSessionsCreated} sessions and ${totalStepsCreated} step records`);
    } else {
      migrationLog.push(`\n🔍 Would create ${dryRunResults.studentsToMigrate} sessions and ${totalExercisesMigrated} step records`);
    }

    // STEP 4: Create database function for progress updates
    migrationLog.push('\n━━━ STEP 4: Creating Helper Functions ━━━');

    if (executeChanges) {
      await sql`
        CREATE OR REPLACE FUNCTION update_student_progress(p_student_id TEXT)
        RETURNS void AS $$
        BEGIN
          -- This function can be extended to update aggregate progress metrics
          -- For now, it's a placeholder for future enhancements
          -- You could add logic here to update a summary table, calculate completion rates, etc.
          NULL;
        END;
        $$ LANGUAGE plpgsql;
      `;
      migrationLog.push('✅ Created update_student_progress() function');
    } else {
      migrationLog.push('🔍 Would create update_student_progress() helper function');
    }

    // STEP 5: Recommendations
    migrationLog.push('\n━━━ STEP 5: Post-Migration Steps ━━━');
    migrationLog.push('📝 After migration completes:');
    migrationLog.push('  1. Update frontend to use /api/auth-session for progress tracking');
    migrationLog.push('  2. Test session creation and progress recording');
    migrationLog.push('  3. Verify all student data is accessible');
    migrationLog.push('  4. Once verified, deprecate /api/track-student-progress');
    migrationLog.push('  5. Eventually drop workshop_students.exercises column (keep table for other data)');

    // Return results
    return res.status(200).json({
      success: true,
      mode: executeChanges ? 'EXECUTE' : 'DRY_RUN',
      migrationLog: migrationLog,
      summary: executeChanges ? {
        studentsProcessed: existingStudents.rows.length,
        sessionsCreated: totalSessionsCreated,
        stepsCreated: totalStepsCreated
      } : {
        ...dryRunResults,
        note: 'Set executeChanges: true to run migration'
      }
    });

  } catch (error) {
    console.error('Migration error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
