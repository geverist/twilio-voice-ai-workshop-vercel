/**
 * Migrate Data to Unified Schema V2
 *
 * This script migrates data from legacy tables to the new unified schema:
 * - workshop_students → students + sessions
 * - student_configs → sessions (merged)
 *
 * IMPORTANT: Run admin-create-unified-schema.js FIRST before running this migration.
 *
 * This migration:
 * 1. Extracts unique students from all sources
 * 2. Creates student records with UUIDs
 * 3. Migrates all session data to unified sessions table
 * 4. Preserves ALL fields from both old tables
 * 5. Does NOT delete old tables (for safety)
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
    const { adminPassword, dryRun } = req.body;

    // Authentication
    if (!process.env.ADMIN_PASSWORD || adminPassword !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ success: false, error: 'Invalid admin password' });
    }

    const isDryRun = dryRun === true;
    const results = [];

    if (isDryRun) {
      results.push('🔍 DRY RUN MODE - No data will be modified');
    }

    // Check which tables exist
    const tableCheck = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('workshop_students', 'student_configs', 'students', 'sessions')
    `;

    const existingTables = tableCheck.map(t => t.table_name);
    results.push(`✅ Found tables: ${existingTables.join(', ')}`);

    if (!existingTables.includes('students') || !existingTables.includes('sessions')) {
      return res.status(400).json({
        success: false,
        error: 'Unified schema not found. Run /api/admin-create-unified-schema first.',
        existingTables
      });
    }

    // ===========================================
    // STEP 1: Extract unique students from all sources
    // ===========================================

    const uniqueStudents = new Map(); // email → student data

    // Get students from workshop_students
    if (existingTables.includes('workshop_students')) {
      const wsStudents = await sql`
        SELECT DISTINCT ON (student_email)
          student_email,
          student_name,
          created_at
        FROM workshop_students
        WHERE student_email IS NOT NULL
        ORDER BY student_email, created_at ASC
      `;

      wsStudents.forEach(s => {
        if (!uniqueStudents.has(s.student_email)) {
          uniqueStudents.set(s.student_email, {
            email: s.student_email,
            name: s.student_name,
            created_at: s.created_at
          });
        }
      });

      results.push(`✅ Found ${wsStudents.length} unique students in workshop_students`);
    }

    // Get students from student_configs
    if (existingTables.includes('student_configs')) {
      const scStudents = await sql`
        SELECT DISTINCT ON (student_email)
          student_email,
          student_name,
          created_at
        FROM student_configs
        WHERE student_email IS NOT NULL
        ORDER BY student_email, created_at ASC
      `;

      scStudents.forEach(s => {
        if (!uniqueStudents.has(s.student_email)) {
          uniqueStudents.set(s.student_email, {
            email: s.student_email,
            name: s.student_name,
            created_at: s.created_at
          });
        }
      });

      results.push(`✅ Found ${scStudents.length} unique students in student_configs`);
    }

    results.push(`📊 Total unique students to migrate: ${uniqueStudents.size}`);

    // ===========================================
    // STEP 2: Create student records in students table
    // ===========================================

    const studentIdMap = new Map(); // email → UUID

    if (!isDryRun) {
      for (const [email, studentData] of uniqueStudents) {
        try {
          // Check if student already exists
          const existing = await sql`
            SELECT student_id FROM students WHERE student_email = ${email}
          `;

          if (existing.length > 0) {
            studentIdMap.set(email, existing[0].student_id);
            continue;
          }

          // Insert new student
          const inserted = await sql`
            INSERT INTO students (student_email, student_name, created_at)
            VALUES (${email}, ${studentData.name}, ${studentData.created_at})
            RETURNING student_id
          `;

          studentIdMap.set(email, inserted[0].student_id);
        } catch (error) {
          console.error(`Error creating student ${email}:`, error);
          results.push(`⚠️  Failed to create student ${email}: ${error.message}`);
        }
      }

      results.push(`✅ Created/found ${studentIdMap.size} student records`);
    } else {
      results.push(`🔍 Would create ${uniqueStudents.size} student records`);
    }

    // ===========================================
    // STEP 3: Migrate sessions from workshop_students
    // ===========================================

    let wsMigrated = 0;

    if (existingTables.includes('workshop_students')) {
      const wsSessions = await sql`
        SELECT * FROM workshop_students
        WHERE session_token IS NOT NULL
      `;

      results.push(`📋 Found ${wsSessions.length} sessions in workshop_students`);

      if (!isDryRun) {
        for (const session of wsSessions) {
          try {
            const studentId = studentIdMap.get(session.student_email);
            if (!studentId) {
              results.push(`⚠️  No student_id for ${session.student_email}, skipping session`);
              continue;
            }

            // Check if session already exists
            const existing = await sql`
              SELECT session_token FROM sessions WHERE session_token = ${session.session_token}
            `;

            if (existing.length > 0) {
              continue; // Skip duplicates
            }

            // Insert session
            await sql`
              INSERT INTO sessions (
                session_token,
                student_id,
                started_at,
                last_activity,
                demo_mode,
                selected_phone_number,
                selected_voice,
                tts_provider,
                openai_api_key,
                system_prompt,
                tools,
                exercises,
                current_step,
                total_time_spent,
                completion_rate,
                created_at,
                updated_at
              ) VALUES (
                ${session.session_token},
                ${studentId},
                ${session.started_at || session.created_at},
                ${session.last_activity || session.updated_at},
                ${session.demo_mode || false},
                ${session.selected_phone_number},
                ${session.selected_voice},
                ${session.tts_provider},
                ${session.openai_api_key},
                ${session.system_prompt},
                ${session.tools || '[]'},
                ${session.exercises || '{}'},
                ${session.current_step || 0},
                ${session.total_time_spent || 0},
                ${session.completion_rate || 0},
                ${session.created_at},
                ${session.updated_at}
              )
            `;

            wsMigrated++;
          } catch (error) {
            console.error(`Error migrating workshop_students session ${session.session_token}:`, error);
            results.push(`⚠️  Failed to migrate session ${session.session_token}: ${error.message}`);
          }
        }

        results.push(`✅ Migrated ${wsMigrated} sessions from workshop_students`);
      } else {
        results.push(`🔍 Would migrate ${wsSessions.length} sessions from workshop_students`);
      }
    }

    // ===========================================
    // STEP 4: Migrate sessions from student_configs
    // ===========================================

    let scMigrated = 0;

    if (existingTables.includes('student_configs')) {
      const scSessions = await sql`
        SELECT * FROM student_configs
        WHERE session_token IS NOT NULL
      `;

      results.push(`📋 Found ${scSessions.length} sessions in student_configs`);

      if (!isDryRun) {
        for (const config of scSessions) {
          try {
            const studentId = studentIdMap.get(config.student_email);
            if (!studentId) {
              results.push(`⚠️  No student_id for ${config.student_email}, skipping config`);
              continue;
            }

            // Check if session already exists (might have been migrated from workshop_students)
            const existing = await sql`
              SELECT * FROM sessions WHERE session_token = ${config.session_token}
            `;

            if (existing.length > 0) {
              // Update existing session with data from student_configs
              await sql`
                UPDATE sessions
                SET
                  use_case_description = COALESCE(${config.use_case_description}, use_case_description),
                  call_direction = COALESCE(${config.call_direction}, call_direction),
                  selected_phone_number = COALESCE(${config.selected_phone_number}, selected_phone_number),
                  tts_provider = COALESCE(${config.tts_provider}, tts_provider),
                  selected_voice = COALESCE(${config.selected_voice}, selected_voice),
                  openai_api_key = COALESCE(${config.openai_api_key}, openai_api_key),
                  system_prompt = COALESCE(${config.system_prompt}, system_prompt),
                  tools = COALESCE(${config.tools}, tools),
                  voice_settings = COALESCE(${config.voice_settings}, voice_settings),
                  websocket_url = COALESCE(${config.websocket_url}, websocket_url),
                  codespace_url = COALESCE(${config.codespace_url}, codespace_url),
                  github_repo_url = COALESCE(${config.github_repo_url}, github_repo_url),
                  railway_url = COALESCE(${config.railway_url}, railway_url),
                  current_step = COALESCE(${config.current_step}, current_step),
                  twilio_connected = COALESCE(${config.twilio_connected}, twilio_connected),
                  openai_connected = COALESCE(${config.openai_connected}, openai_connected),
                  call_direction_chosen = COALESCE(${config.call_direction_chosen}, call_direction_chosen),
                  services_ready = COALESCE(${config.services_ready}, services_ready),
                  step4_code_validated = COALESCE(${config.step4_code_validated}, step4_code_validated),
                  step4_committed = COALESCE(${config.step4_committed}, step4_committed),
                  step4_deployed = COALESCE(${config.step4_deployed}, step4_deployed),
                  step5_code_validated = COALESCE(${config.step5_code_validated}, step5_code_validated),
                  step5_committed = COALESCE(${config.step5_committed}, step5_committed),
                  step5_deployed = COALESCE(${config.step5_deployed}, step5_deployed),
                  step6_code_validated = COALESCE(${config.step6_code_validated}, step6_code_validated),
                  step6_committed = COALESCE(${config.step6_committed}, step6_committed),
                  step6_deployed = COALESCE(${config.step6_deployed}, step6_deployed),
                  system_prompt_saved = COALESCE(${config.system_prompt_saved}, system_prompt_saved),
                  step7_committed = COALESCE(${config.step7_committed}, step7_committed),
                  step7_deployed = COALESCE(${config.step7_deployed}, step7_deployed),
                  tools_configured = COALESCE(${config.tools_configured}, tools_configured),
                  step8_code_validated = COALESCE(${config.step8_code_validated}, step8_code_validated),
                  step8_committed = COALESCE(${config.step8_committed}, step8_committed),
                  step8_deployed = COALESCE(${config.step8_deployed}, step8_deployed),
                  project_deployed = COALESCE(${config.project_deployed}, project_deployed)
                WHERE session_token = ${config.session_token}
              `;

              scMigrated++;
              continue;
            }

            // Insert new session from student_configs
            await sql`
              INSERT INTO sessions (
                session_token,
                student_id,
                use_case_description,
                call_direction,
                selected_phone_number,
                tts_provider,
                selected_voice,
                openai_api_key,
                system_prompt,
                tools,
                voice_settings,
                websocket_url,
                codespace_url,
                github_repo_url,
                railway_url,
                current_step,
                twilio_connected,
                openai_connected,
                call_direction_chosen,
                services_ready,
                step4_code_validated,
                step4_committed,
                step4_deployed,
                step5_code_validated,
                step5_committed,
                step5_deployed,
                step6_code_validated,
                step6_committed,
                step6_deployed,
                system_prompt_saved,
                step7_committed,
                step7_deployed,
                tools_configured,
                step8_code_validated,
                step8_committed,
                step8_deployed,
                project_deployed,
                created_at,
                updated_at
              ) VALUES (
                ${config.session_token},
                ${studentId},
                ${config.use_case_description},
                ${config.call_direction},
                ${config.selected_phone_number},
                ${config.tts_provider},
                ${config.selected_voice},
                ${config.openai_api_key},
                ${config.system_prompt},
                ${config.tools || '[]'},
                ${config.voice_settings || '{}'},
                ${config.websocket_url},
                ${config.codespace_url},
                ${config.github_repo_url},
                ${config.railway_url},
                ${config.current_step || 0},
                ${config.twilio_connected || false},
                ${config.openai_connected || false},
                ${config.call_direction_chosen || false},
                ${config.services_ready || false},
                ${config.step4_code_validated || false},
                ${config.step4_committed || false},
                ${config.step4_deployed || false},
                ${config.step5_code_validated || false},
                ${config.step5_committed || false},
                ${config.step5_deployed || false},
                ${config.step6_code_validated || false},
                ${config.step6_committed || false},
                ${config.step6_deployed || false},
                ${config.system_prompt_saved || false},
                ${config.step7_committed || false},
                ${config.step7_deployed || false},
                ${config.tools_configured || false},
                ${config.step8_code_validated || false},
                ${config.step8_committed || false},
                ${config.step8_deployed || false},
                ${config.project_deployed || false},
                ${config.created_at},
                ${config.updated_at}
              )
            `;

            scMigrated++;
          } catch (error) {
            console.error(`Error migrating student_configs session ${config.session_token}:`, error);
            results.push(`⚠️  Failed to migrate config ${config.session_token}: ${error.message}`);
          }
        }

        results.push(`✅ Migrated/merged ${scMigrated} sessions from student_configs`);
      } else {
        results.push(`🔍 Would migrate ${scSessions.length} sessions from student_configs`);
      }
    }

    // ===========================================
    // STEP 5: Update completion rates for all sessions
    // ===========================================

    if (!isDryRun) {
      const allSessions = await sql`SELECT session_token FROM sessions`;

      for (const session of allSessions) {
        try {
          await sql`SELECT update_session_progress(${session.session_token})`;
        } catch (error) {
          console.error(`Error updating progress for ${session.session_token}:`, error);
        }
      }

      results.push(`✅ Updated completion rates for ${allSessions.length} sessions`);
    }

    // ===========================================
    // Summary
    // ===========================================

    const summary = {
      uniqueStudents: uniqueStudents.size,
      studentsMigrated: studentIdMap.size,
      workshopSessionsMigrated: wsMigrated,
      configsMigrated: scMigrated,
      totalSessions: wsMigrated + scMigrated
    };

    return res.status(200).json({
      success: true,
      message: isDryRun ? 'Dry run completed - no data modified' : 'Migration completed successfully',
      summary,
      results,
      nextSteps: isDryRun ? [
        '1. Review the results above',
        '2. Run again with dryRun: false to perform actual migration'
      ] : [
        '1. Verify data in students and sessions tables',
        '2. Test instructor dashboard: /public/instructor-dashboard.html',
        '3. Once verified, backup old tables: workshop_students, student_configs',
        '4. Consider dropping old tables after backup'
      ]
    });

  } catch (error) {
    console.error('Migration error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      details: error.stack
    });
  }
}
