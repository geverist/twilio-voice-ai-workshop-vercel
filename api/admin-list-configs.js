/**
 * Admin: List Student Configs
 *
 * Lists all student sessions with detailed information for instructor dashboard
 * Requires admin password authentication
 *
 * POST /api/admin-list-configs
 * Body: {
 *   adminPassword: string
 * }
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

    if (!adminPassword) {
      return res.status(400).json({
        success: false,
        error: 'adminPassword is required'
      });
    }

    if (adminPassword !== correctPassword) {
      console.warn('⚠️ Unauthorized admin list attempt');
      return res.status(401).json({
        success: false,
        error: 'Invalid admin password'
      });
    }

    // Check what tables exist
    const checkTables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND (table_name = 'students' OR table_name = 'sessions' OR table_name = 'workshop_students' OR table_name = 'student_configs')
    `;

    const tableNames = checkTables.map(t => t.table_name);
    let students = [];
    let sessions = [];

    // Check if normalized structure exists
    if (tableNames.includes('students') && tableNames.includes('sessions')) {
      // First check if sessions table has the expected columns
      const sessionColumns = await sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'sessions'
      `;

      const columnNames = sessionColumns.map(c => c.column_name);
      const hasSessionToken = columnNames.includes('session_token');
      const hasStudentId = columnNames.includes('student_id');

      if (!hasSessionToken) {
        // Sessions table exists but doesn't have the right structure
        // Fall through to check workshop_students instead
        console.warn('⚠️ Sessions table exists but missing session_token column, checking workshop_students');
        // Reset students/sessions so we fall through to workshop_students check
        students = [];
        sessions = [];
      } else {
        // Check students table columns
        const studentsColumns = await sql`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_name = 'students'
        `;
        const studentsColumnNames = studentsColumns.map(c => c.column_name);
        const hasStudentEmail = studentsColumnNames.includes('student_email');

        // V2 normalized schema uses student_id FK, need to JOIN with students table
        if (hasStudentId) {
          // Build dynamic SELECT for sessions columns (prefixed with s.)
          const sessionSelectColumns = ['s.session_token', 's.student_id'];
          // Configuration fields
          if (columnNames.includes('selected_phone_number')) sessionSelectColumns.push('s.selected_phone_number');
          if (columnNames.includes('selected_voice')) sessionSelectColumns.push('s.selected_voice');
          if (columnNames.includes('tts_provider')) sessionSelectColumns.push('s.tts_provider');
          if (columnNames.includes('call_direction')) sessionSelectColumns.push('s.call_direction');
          if (columnNames.includes('use_case')) sessionSelectColumns.push('s.use_case');
          if (columnNames.includes('system_prompt')) sessionSelectColumns.push('s.system_prompt');
          if (columnNames.includes('tools')) sessionSelectColumns.push('s.tools');
          // Progress tracking fields
          if (columnNames.includes('demo_mode')) sessionSelectColumns.push('s.demo_mode');
          if (columnNames.includes('current_step')) sessionSelectColumns.push('s.current_step');
          if (columnNames.includes('twilio_connected')) sessionSelectColumns.push('s.twilio_connected');
          if (columnNames.includes('openai_connected')) sessionSelectColumns.push('s.openai_connected');
          if (columnNames.includes('call_direction_chosen')) sessionSelectColumns.push('s.call_direction_chosen');
          if (columnNames.includes('services_ready')) sessionSelectColumns.push('s.services_ready');
          // Step validation flags
          if (columnNames.includes('step4_code_validated')) sessionSelectColumns.push('s.step4_code_validated');
          if (columnNames.includes('step4_committed')) sessionSelectColumns.push('s.step4_committed');
          if (columnNames.includes('step4_deployed')) sessionSelectColumns.push('s.step4_deployed');
          if (columnNames.includes('step5_code_validated')) sessionSelectColumns.push('s.step5_code_validated');
          if (columnNames.includes('step5_committed')) sessionSelectColumns.push('s.step5_committed');
          if (columnNames.includes('step5_deployed')) sessionSelectColumns.push('s.step5_deployed');
          if (columnNames.includes('step6_code_validated')) sessionSelectColumns.push('s.step6_code_validated');
          if (columnNames.includes('step6_committed')) sessionSelectColumns.push('s.step6_committed');
          if (columnNames.includes('step6_deployed')) sessionSelectColumns.push('s.step6_deployed');
          if (columnNames.includes('system_prompt_saved')) sessionSelectColumns.push('s.system_prompt_saved');
          if (columnNames.includes('step7_committed')) sessionSelectColumns.push('s.step7_committed');
          if (columnNames.includes('step7_deployed')) sessionSelectColumns.push('s.step7_deployed');
          if (columnNames.includes('tools_configured')) sessionSelectColumns.push('s.tools_configured');
          if (columnNames.includes('step8_code_validated')) sessionSelectColumns.push('s.step8_code_validated');
          if (columnNames.includes('step8_committed')) sessionSelectColumns.push('s.step8_committed');
          if (columnNames.includes('step8_deployed')) sessionSelectColumns.push('s.step8_deployed');
          if (columnNames.includes('project_deployed')) sessionSelectColumns.push('s.project_deployed');
          // Timestamps
          if (columnNames.includes('created_at')) sessionSelectColumns.push('s.created_at');
          if (columnNames.includes('updated_at')) sessionSelectColumns.push('s.updated_at');

          // Add conditional selections for nullable fields
          const conditionalSelections = [];
          if (columnNames.includes('openai_api_key')) {
            conditionalSelections.push('CASE WHEN s.openai_api_key IS NOT NULL THEN true ELSE false END as has_api_key');
          }
          if (columnNames.includes('system_prompt')) {
            conditionalSelections.push('CASE WHEN s.system_prompt IS NOT NULL THEN true ELSE false END as has_system_prompt');
          }
          if (columnNames.includes('tools')) {
            conditionalSelections.push("CASE WHEN s.tools IS NOT NULL AND s.tools::text != '[]' THEN true ELSE false END as has_tools");
          }

          // Query students
          const studentsQuery = `
            SELECT
              student_id,
              ${hasStudentEmail ? 'student_email,' : ''}
              student_name,
              created_at,
              updated_at
            FROM students
            ORDER BY created_at DESC
          `;
          students = await sql.unsafe(studentsQuery);

          // Query sessions with JOIN to students table
          const query = `
            SELECT
              ${sessionSelectColumns.join(', ')}
              ${conditionalSelections.length > 0 ? ', ' + conditionalSelections.join(', ') : ''}
              ${hasStudentEmail ? ', st.student_email' : ''}
              , st.student_name as student_name_from_students
            FROM sessions s
            INNER JOIN students st ON s.student_id = st.student_id
            ORDER BY s.created_at DESC
          `;

          sessions = await sql.unsafe(query);
        } else {
          // Legacy schema - student_email directly in sessions table
          const selectColumns = ['session_token', 'student_email'];
          // Configuration fields
          if (columnNames.includes('selected_phone_number')) selectColumns.push('selected_phone_number');
          if (columnNames.includes('selected_voice')) selectColumns.push('selected_voice');
          if (columnNames.includes('tts_provider')) selectColumns.push('tts_provider');
          if (columnNames.includes('call_direction')) selectColumns.push('call_direction');
          if (columnNames.includes('use_case')) selectColumns.push('use_case');
          if (columnNames.includes('system_prompt')) selectColumns.push('system_prompt');
          if (columnNames.includes('tools')) selectColumns.push('tools');
          // Progress tracking fields
          if (columnNames.includes('demo_mode')) selectColumns.push('demo_mode');
          if (columnNames.includes('current_step')) selectColumns.push('current_step');
          if (columnNames.includes('twilio_connected')) selectColumns.push('twilio_connected');
          if (columnNames.includes('openai_connected')) selectColumns.push('openai_connected');
          if (columnNames.includes('call_direction_chosen')) selectColumns.push('call_direction_chosen');
          if (columnNames.includes('services_ready')) selectColumns.push('services_ready');
          // Step validation flags
          if (columnNames.includes('step4_code_validated')) selectColumns.push('step4_code_validated');
          if (columnNames.includes('step4_committed')) selectColumns.push('step4_committed');
          if (columnNames.includes('step4_deployed')) selectColumns.push('step4_deployed');
          if (columnNames.includes('step5_code_validated')) selectColumns.push('step5_code_validated');
          if (columnNames.includes('step5_committed')) selectColumns.push('step5_committed');
          if (columnNames.includes('step5_deployed')) selectColumns.push('step5_deployed');
          if (columnNames.includes('step6_code_validated')) selectColumns.push('step6_code_validated');
          if (columnNames.includes('step6_committed')) selectColumns.push('step6_committed');
          if (columnNames.includes('step6_deployed')) selectColumns.push('step6_deployed');
          if (columnNames.includes('system_prompt_saved')) selectColumns.push('system_prompt_saved');
          if (columnNames.includes('step7_committed')) selectColumns.push('step7_committed');
          if (columnNames.includes('step7_deployed')) selectColumns.push('step7_deployed');
          if (columnNames.includes('tools_configured')) selectColumns.push('tools_configured');
          if (columnNames.includes('step8_code_validated')) selectColumns.push('step8_code_validated');
          if (columnNames.includes('step8_committed')) selectColumns.push('step8_committed');
          if (columnNames.includes('step8_deployed')) selectColumns.push('step8_deployed');
          if (columnNames.includes('project_deployed')) selectColumns.push('project_deployed');
          // Timestamps
          if (columnNames.includes('created_at')) selectColumns.push('created_at');
          if (columnNames.includes('updated_at')) selectColumns.push('updated_at');

          // Add conditional selections for nullable fields
          const conditionalSelections = [];
          if (columnNames.includes('openai_api_key')) {
            conditionalSelections.push('CASE WHEN openai_api_key IS NOT NULL THEN true ELSE false END as has_api_key');
          }
          if (columnNames.includes('system_prompt')) {
            conditionalSelections.push('CASE WHEN system_prompt IS NOT NULL THEN true ELSE false END as has_system_prompt');
          }
          if (columnNames.includes('tools')) {
            conditionalSelections.push("CASE WHEN tools IS NOT NULL AND tools::text != '[]' THEN true ELSE false END as has_tools");
          }

          // Use normalized structure
          students = await sql`
            SELECT
              student_email,
              student_name,
              created_at,
              updated_at
            FROM students
            ORDER BY created_at DESC
          `;

          // Query sessions with dynamic column selection
          const query = `
            SELECT
              ${selectColumns.join(', ')}
              ${conditionalSelections.length > 0 ? ', ' + conditionalSelections.join(', ') : ''}
            FROM sessions
            ORDER BY created_at DESC
          `;

          sessions = await sql.unsafe(query);
        }
      }
    }

    // Check if merged structure exists (with session_token column)
    if ((students.length === 0 && sessions.length === 0) && tableNames.includes('workshop_students')) {
      // Check if session_token column exists
      const columns = await sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'workshop_students'
        AND column_name = 'session_token'
      `;

      if (columns.length > 0) {
        // Has session_token - use merged structure - check columns first
        const workshopColumns = await sql`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_name = 'workshop_students'
        `;
        const columnNames = workshopColumns.map(c => c.column_name);

        const selectColumns = [];
        if (columnNames.includes('session_token')) selectColumns.push('session_token');
        if (columnNames.includes('student_email')) selectColumns.push('student_email');
        if (columnNames.includes('student_name')) selectColumns.push('student_name');
        if (columnNames.includes('selected_phone_number')) selectColumns.push('selected_phone_number');
        if (columnNames.includes('selected_voice')) selectColumns.push('selected_voice');
        if (columnNames.includes('tts_provider')) selectColumns.push('tts_provider');
        if (columnNames.includes('created_at')) selectColumns.push('created_at');
        if (columnNames.includes('updated_at')) selectColumns.push('updated_at');

        const conditionalSelections = [];
        if (columnNames.includes('openai_api_key')) {
          conditionalSelections.push('CASE WHEN openai_api_key IS NOT NULL THEN true ELSE false END as has_api_key');
        }
        if (columnNames.includes('system_prompt')) {
          conditionalSelections.push('CASE WHEN system_prompt IS NOT NULL THEN true ELSE false END as has_system_prompt');
        }
        if (columnNames.includes('tools')) {
          conditionalSelections.push("CASE WHEN tools IS NOT NULL AND tools::text != '[]' THEN true ELSE false END as has_tools");
        }

        const query = `
          SELECT
            ${selectColumns.join(', ')}
            ${conditionalSelections.length > 0 ? ', ' + conditionalSelections.join(', ') : ''}
          FROM workshop_students
          ORDER BY created_at DESC
        `;

        const result = await sql.unsafe(query);

        // Extract unique students
        const uniqueStudents = {};
        result.forEach(row => {
          if (!uniqueStudents[row.student_email]) {
            uniqueStudents[row.student_email] = {
              student_email: row.student_email,
              student_name: row.student_name,
              created_at: row.created_at,
              updated_at: row.updated_at
            };
          }
        });
        students = Object.values(uniqueStudents);
        sessions = result;

        // If student_configs also exists, LEFT JOIN to get additional config data
        if (tableNames.includes('student_configs')) {
          const configColumns = await sql`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'student_configs'
          `;
          const configColumnNames = configColumns.map(c => c.column_name);

          // Build list of config columns to select (without sc. prefix - will be added in query)
          const configSelectColumns = [];
          if (configColumnNames.includes('call_direction')) configSelectColumns.push('call_direction');
          if (configColumnNames.includes('use_case_description')) configSelectColumns.push('use_case_description as use_case');
          if (configColumnNames.includes('system_prompt')) configSelectColumns.push('system_prompt');
          if (configColumnNames.includes('tools')) configSelectColumns.push('tools');
          if (configColumnNames.includes('selected_phone_number')) configSelectColumns.push('selected_phone_number as config_phone');
          if (configColumnNames.includes('selected_voice')) configSelectColumns.push('selected_voice as config_voice');
          if (configColumnNames.includes('tts_provider')) configSelectColumns.push('tts_provider as config_tts');

          // Only build conditional selections for columns that exist in student_configs
          const configConditionalSelections = [];
          if (configColumnNames.includes('openai_api_key')) {
            configConditionalSelections.push('CASE WHEN sc.openai_api_key IS NOT NULL THEN true ELSE false END as config_has_api_key');
          }
          if (configColumnNames.includes('system_prompt')) {
            configConditionalSelections.push('CASE WHEN sc.system_prompt IS NOT NULL THEN true ELSE false END as config_has_system_prompt');
          }
          if (configColumnNames.includes('tools')) {
            configConditionalSelections.push("CASE WHEN sc.tools IS NOT NULL AND sc.tools::text != '[]' THEN true ELSE false END as config_has_tools");
          }

          // Add state tracking columns from student_configs
          if (configColumnNames.includes('current_step')) configSelectColumns.push('current_step');
          if (configColumnNames.includes('twilio_connected')) configSelectColumns.push('twilio_connected');
          if (configColumnNames.includes('openai_connected')) configSelectColumns.push('openai_connected');
          if (configColumnNames.includes('call_direction_chosen')) configSelectColumns.push('call_direction_chosen');
          if (configColumnNames.includes('services_ready')) configSelectColumns.push('services_ready');
          if (configColumnNames.includes('step4_code_validated')) configSelectColumns.push('step4_code_validated');
          if (configColumnNames.includes('step4_committed')) configSelectColumns.push('step4_committed');
          if (configColumnNames.includes('step4_deployed')) configSelectColumns.push('step4_deployed');
          if (configColumnNames.includes('step5_code_validated')) configSelectColumns.push('step5_code_validated');
          if (configColumnNames.includes('step5_committed')) configSelectColumns.push('step5_committed');
          if (configColumnNames.includes('step5_deployed')) configSelectColumns.push('step5_deployed');
          if (configColumnNames.includes('step6_code_validated')) configSelectColumns.push('step6_code_validated');
          if (configColumnNames.includes('step6_committed')) configSelectColumns.push('step6_committed');
          if (configColumnNames.includes('step6_deployed')) configSelectColumns.push('step6_deployed');
          if (configColumnNames.includes('system_prompt_saved')) configSelectColumns.push('system_prompt_saved');
          if (configColumnNames.includes('step7_committed')) configSelectColumns.push('step7_committed');
          if (configColumnNames.includes('step7_deployed')) configSelectColumns.push('step7_deployed');
          if (configColumnNames.includes('tools_configured')) configSelectColumns.push('tools_configured');
          if (configColumnNames.includes('step8_code_validated')) configSelectColumns.push('step8_code_validated');
          if (configColumnNames.includes('step8_committed')) configSelectColumns.push('step8_committed');
          if (configColumnNames.includes('step8_deployed')) configSelectColumns.push('step8_deployed');
          if (configColumnNames.includes('project_deployed')) configSelectColumns.push('project_deployed');

          if (configSelectColumns.length > 0 || configConditionalSelections.length > 0) {
            // Build dynamic SELECT for workshop_students columns that actually exist
            const wsSelectColumns = ['ws.session_token', 'ws.student_email'];
            if (columnNames.includes('student_name')) wsSelectColumns.push('ws.student_name');
            if (columnNames.includes('created_at')) wsSelectColumns.push('ws.created_at');
            if (columnNames.includes('updated_at')) wsSelectColumns.push('ws.updated_at');
            if (columnNames.includes('demo_mode')) wsSelectColumns.push('ws.demo_mode');
            if (columnNames.includes('selected_phone_number')) wsSelectColumns.push('ws.selected_phone_number');
            if (columnNames.includes('selected_voice')) wsSelectColumns.push('ws.selected_voice');
            if (columnNames.includes('tts_provider')) wsSelectColumns.push('ws.tts_provider');

            const wsConditionalSelections = [];
            if (columnNames.includes('openai_api_key')) {
              wsConditionalSelections.push('CASE WHEN ws.openai_api_key IS NOT NULL THEN true ELSE false END as has_api_key');
            }
            if (columnNames.includes('system_prompt')) {
              wsConditionalSelections.push('CASE WHEN ws.system_prompt IS NOT NULL THEN true ELSE false END as has_system_prompt');
            }
            if (columnNames.includes('tools')) {
              wsConditionalSelections.push("CASE WHEN ws.tools IS NOT NULL AND ws.tools::text != '[]' THEN true ELSE false END as has_tools");
            }

            const joinQuery = `
              SELECT
                ${wsSelectColumns.join(', ')}
                ${wsConditionalSelections.length > 0 ? ', ' + wsConditionalSelections.join(', ') : ''}
                ${configSelectColumns.length > 0 ? ', sc.' + configSelectColumns.join(', sc.') : ''}
                ${configConditionalSelections.length > 0 ? ', ' + configConditionalSelections.join(', ') : ''}
              FROM workshop_students ws
              LEFT JOIN student_configs sc ON ws.session_token = sc.session_token
              ORDER BY ws.created_at DESC
            `;

            const joinedResult = await sql.unsafe(joinQuery);

            // Also get sessions that exist ONLY in student_configs (not in workshop_students)
            const orphanConfigsQuery = `
              SELECT
                sc.session_token,
                sc.student_email,
                sc.student_name,
                sc.selected_phone_number,
                sc.selected_voice,
                sc.tts_provider,
                sc.call_direction,
                ${configColumnNames.includes('use_case_description') ? 'sc.use_case_description as use_case' : 'NULL as use_case'},
                sc.system_prompt,
                sc.tools,
                CASE WHEN sc.openai_api_key IS NOT NULL THEN true ELSE false END as has_api_key,
                CASE WHEN sc.system_prompt IS NOT NULL THEN true ELSE false END as has_system_prompt,
                CASE WHEN sc.tools IS NOT NULL AND sc.tools::text != '[]' THEN true ELSE false END as has_tools,
                false as demo_mode,
                ${configColumnNames.includes('current_step') ? 'sc.current_step' : '0 as current_step'},
                ${configColumnNames.includes('twilio_connected') ? 'sc.twilio_connected' : 'false as twilio_connected'},
                ${configColumnNames.includes('openai_connected') ? 'sc.openai_connected' : 'false as openai_connected'},
                ${configColumnNames.includes('call_direction_chosen') ? 'sc.call_direction_chosen' : 'false as call_direction_chosen'},
                ${configColumnNames.includes('services_ready') ? 'sc.services_ready' : 'false as services_ready'},
                ${configColumnNames.includes('step4_code_validated') ? 'sc.step4_code_validated' : 'false as step4_code_validated'},
                ${configColumnNames.includes('step4_committed') ? 'sc.step4_committed' : 'false as step4_committed'},
                ${configColumnNames.includes('step4_deployed') ? 'sc.step4_deployed' : 'false as step4_deployed'},
                ${configColumnNames.includes('step5_code_validated') ? 'sc.step5_code_validated' : 'false as step5_code_validated'},
                ${configColumnNames.includes('step5_committed') ? 'sc.step5_committed' : 'false as step5_committed'},
                ${configColumnNames.includes('step5_deployed') ? 'sc.step5_deployed' : 'false as step5_deployed'},
                ${configColumnNames.includes('step6_code_validated') ? 'sc.step6_code_validated' : 'false as step6_code_validated'},
                ${configColumnNames.includes('step6_committed') ? 'sc.step6_committed' : 'false as step6_committed'},
                ${configColumnNames.includes('step6_deployed') ? 'sc.step6_deployed' : 'false as step6_deployed'},
                ${configColumnNames.includes('system_prompt_saved') ? 'sc.system_prompt_saved' : 'false as system_prompt_saved'},
                ${configColumnNames.includes('step7_committed') ? 'sc.step7_committed' : 'false as step7_committed'},
                ${configColumnNames.includes('step7_deployed') ? 'sc.step7_deployed' : 'false as step7_deployed'},
                ${configColumnNames.includes('tools_configured') ? 'sc.tools_configured' : 'false as tools_configured'},
                ${configColumnNames.includes('step8_code_validated') ? 'sc.step8_code_validated' : 'false as step8_code_validated'},
                ${configColumnNames.includes('step8_committed') ? 'sc.step8_committed' : 'false as step8_committed'},
                ${configColumnNames.includes('step8_deployed') ? 'sc.step8_deployed' : 'false as step8_deployed'},
                ${configColumnNames.includes('project_deployed') ? 'sc.project_deployed' : 'false as project_deployed'},
                sc.created_at,
                sc.updated_at
              FROM student_configs sc
              LEFT JOIN workshop_students ws ON sc.session_token = ws.session_token
              WHERE ws.session_token IS NULL
              ORDER BY sc.created_at DESC
            `;

            const orphanConfigs = await sql.unsafe(orphanConfigsQuery);

            // Merge config data into sessions
            sessions = [
              ...joinedResult.map(row => ({
              session_token: row.session_token,
              student_email: row.student_email,
              student_name: row.student_name,
              selected_phone_number: row.config_phone || row.selected_phone_number,
              selected_voice: row.config_voice || row.selected_voice,
              tts_provider: row.config_tts || row.tts_provider,
              call_direction: row.call_direction,
              use_case: row.use_case,
              system_prompt: row.system_prompt,
              tools: row.tools,
              has_api_key: row.config_has_api_key !== undefined ? row.config_has_api_key : row.has_api_key,
              has_system_prompt: row.config_has_system_prompt !== undefined ? row.config_has_system_prompt : row.has_system_prompt,
              has_tools: row.config_has_tools !== undefined ? row.config_has_tools : row.has_tools,
              demo_mode: row.demo_mode,
              current_step: row.current_step,
              twilio_connected: row.twilio_connected,
              openai_connected: row.openai_connected,
              call_direction_chosen: row.call_direction_chosen,
              services_ready: row.services_ready,
              step4_code_validated: row.step4_code_validated,
              step4_committed: row.step4_committed,
              step4_deployed: row.step4_deployed,
              step5_code_validated: row.step5_code_validated,
              step5_committed: row.step5_committed,
              step5_deployed: row.step5_deployed,
              step6_code_validated: row.step6_code_validated,
              step6_committed: row.step6_committed,
              step6_deployed: row.step6_deployed,
              system_prompt_saved: row.system_prompt_saved,
              step7_committed: row.step7_committed,
              step7_deployed: row.step7_deployed,
              tools_configured: row.tools_configured,
              step8_code_validated: row.step8_code_validated,
              step8_committed: row.step8_committed,
              step8_deployed: row.step8_deployed,
              project_deployed: row.project_deployed,
              created_at: row.created_at,
              updated_at: row.updated_at
            })),
              // Add sessions that exist only in student_configs
              ...orphanConfigs.map(row => ({
                session_token: row.session_token,
                student_email: row.student_email,
                student_name: row.student_name,
                selected_phone_number: row.selected_phone_number,
                selected_voice: row.selected_voice,
                tts_provider: row.tts_provider,
                call_direction: row.call_direction,
                use_case: row.use_case,
                system_prompt: row.system_prompt,
                tools: row.tools,
                has_api_key: row.has_api_key,
                has_system_prompt: row.has_system_prompt,
                has_tools: row.has_tools,
                demo_mode: row.demo_mode,
                current_step: row.current_step,
                twilio_connected: row.twilio_connected,
                openai_connected: row.openai_connected,
                call_direction_chosen: row.call_direction_chosen,
                services_ready: row.services_ready,
                step4_code_validated: row.step4_code_validated,
                step4_committed: row.step4_committed,
                step4_deployed: row.step4_deployed,
                step5_code_validated: row.step5_code_validated,
                step5_committed: row.step5_committed,
                step5_deployed: row.step5_deployed,
                step6_code_validated: row.step6_code_validated,
                step6_committed: row.step6_committed,
                step6_deployed: row.step6_deployed,
                system_prompt_saved: row.system_prompt_saved,
                step7_committed: row.step7_committed,
                step7_deployed: row.step7_deployed,
                tools_configured: row.tools_configured,
                step8_code_validated: row.step8_code_validated,
                step8_committed: row.step8_committed,
                step8_deployed: row.step8_deployed,
                project_deployed: row.project_deployed,
                created_at: row.created_at,
                updated_at: row.updated_at
              }))
            ];
          }
        }
      } else {
        // Old structure - student_email is PK, no session_token - check columns first
        const workshopColumns = await sql`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_name = 'workshop_students'
        `;
        const columnNames = workshopColumns.map(c => c.column_name);

        const selectColumns = [];
        if (columnNames.includes('student_email')) selectColumns.push('student_email');
        if (columnNames.includes('student_name')) selectColumns.push('student_name');
        if (columnNames.includes('selected_phone_number')) selectColumns.push('selected_phone_number');
        if (columnNames.includes('selected_voice')) selectColumns.push('selected_voice');
        if (columnNames.includes('tts_provider')) selectColumns.push('tts_provider');
        if (columnNames.includes('created_at')) selectColumns.push('created_at');
        if (columnNames.includes('updated_at')) selectColumns.push('updated_at');

        const conditionalSelections = [];
        if (columnNames.includes('openai_api_key')) {
          conditionalSelections.push('CASE WHEN openai_api_key IS NOT NULL THEN true ELSE false END as has_api_key');
        }
        if (columnNames.includes('system_prompt')) {
          conditionalSelections.push('CASE WHEN system_prompt IS NOT NULL THEN true ELSE false END as has_system_prompt');
        }
        if (columnNames.includes('tools')) {
          conditionalSelections.push("CASE WHEN tools IS NOT NULL AND tools::text != '[]' THEN true ELSE false END as has_tools");
        }

        const query = `
          SELECT
            ${selectColumns.join(', ')}
            ${conditionalSelections.length > 0 ? ', ' + conditionalSelections.join(', ') : ''}
          FROM workshop_students
          ORDER BY created_at DESC
        `;

        const result = await sql.unsafe(query);

        // In old structure, each row is a student (not a session)
        students = result;
        // No sessions - just return student data as if they're sessions
        sessions = result.map(row => ({
          session_token: row.student_email, // Use email as pseudo session token
          student_email: row.student_email,
          selected_phone_number: row.selected_phone_number,
          selected_voice: row.selected_voice,
          tts_provider: row.tts_provider,
          has_api_key: row.has_api_key,
          has_system_prompt: row.has_system_prompt,
          has_tools: row.has_tools,
          created_at: row.created_at,
          updated_at: row.updated_at
        }));
      }
    }
    // Query student_configs (always use if exists, might need to JOIN with workshop_students)
    if ((students.length === 0 && sessions.length === 0) && tableNames.includes('student_configs')) {
      // Check available columns
      const configColumns = await sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'student_configs'
      `;
      const columnNames = configColumns.map(c => c.column_name);

      // Build dynamic SELECT
      const selectColumns = [];
      if (columnNames.includes('session_token')) selectColumns.push('session_token');
      if (columnNames.includes('student_name')) selectColumns.push('student_name');
      if (columnNames.includes('student_email')) selectColumns.push('student_email');
      if (columnNames.includes('selected_phone_number')) selectColumns.push('selected_phone_number');
      if (columnNames.includes('selected_voice')) selectColumns.push('selected_voice');
      if (columnNames.includes('tts_provider')) selectColumns.push('tts_provider');
      if (columnNames.includes('call_direction')) selectColumns.push('call_direction');
      if (columnNames.includes('use_case')) selectColumns.push('use_case');
      if (columnNames.includes('system_prompt')) selectColumns.push('system_prompt');
      if (columnNames.includes('tools')) selectColumns.push('tools');
      if (columnNames.includes('current_step')) selectColumns.push('current_step');
      if (columnNames.includes('twilio_connected')) selectColumns.push('twilio_connected');
      if (columnNames.includes('openai_connected')) selectColumns.push('openai_connected');
      if (columnNames.includes('call_direction_chosen')) selectColumns.push('call_direction_chosen');
      if (columnNames.includes('services_ready')) selectColumns.push('services_ready');
      if (columnNames.includes('step4_code_validated')) selectColumns.push('step4_code_validated');
      if (columnNames.includes('step4_committed')) selectColumns.push('step4_committed');
      if (columnNames.includes('step4_deployed')) selectColumns.push('step4_deployed');
      if (columnNames.includes('step5_code_validated')) selectColumns.push('step5_code_validated');
      if (columnNames.includes('step5_committed')) selectColumns.push('step5_committed');
      if (columnNames.includes('step5_deployed')) selectColumns.push('step5_deployed');
      if (columnNames.includes('step6_code_validated')) selectColumns.push('step6_code_validated');
      if (columnNames.includes('step6_committed')) selectColumns.push('step6_committed');
      if (columnNames.includes('step6_deployed')) selectColumns.push('step6_deployed');
      if (columnNames.includes('system_prompt_saved')) selectColumns.push('system_prompt_saved');
      if (columnNames.includes('step7_committed')) selectColumns.push('step7_committed');
      if (columnNames.includes('step7_deployed')) selectColumns.push('step7_deployed');
      if (columnNames.includes('tools_configured')) selectColumns.push('tools_configured');
      if (columnNames.includes('step8_code_validated')) selectColumns.push('step8_code_validated');
      if (columnNames.includes('step8_committed')) selectColumns.push('step8_committed');
      if (columnNames.includes('step8_deployed')) selectColumns.push('step8_deployed');
      if (columnNames.includes('project_deployed')) selectColumns.push('project_deployed');
      if (columnNames.includes('created_at')) selectColumns.push('created_at');
      if (columnNames.includes('updated_at')) selectColumns.push('updated_at');

      const conditionalSelections = [];
      if (columnNames.includes('openai_api_key')) {
        conditionalSelections.push('CASE WHEN openai_api_key IS NOT NULL THEN true ELSE false END as has_api_key');
      }
      if (columnNames.includes('system_prompt')) {
        conditionalSelections.push('CASE WHEN system_prompt IS NOT NULL THEN true ELSE false END as has_system_prompt');
      }
      if (columnNames.includes('tools')) {
        conditionalSelections.push("CASE WHEN tools IS NOT NULL AND tools::text != '[]' THEN true ELSE false END as has_tools");
      }

      const query = `
        SELECT
          ${selectColumns.join(', ')}
          ${conditionalSelections.length > 0 ? ', ' + conditionalSelections.join(', ') : ''}
        FROM student_configs
        ORDER BY created_at DESC
      `;

      const result = await sql.unsafe(query);

      // Extract unique students from student_email
      const uniqueStudents = {};
      result.forEach(row => {
        const email = row.student_email || 'unknown@example.com';
        if (!uniqueStudents[email]) {
          uniqueStudents[email] = {
            student_email: email,
            student_name: row.student_name || 'Unnamed',
            created_at: row.created_at,
            updated_at: row.updated_at
          };
        }
      });
      students = Object.values(uniqueStudents);
      sessions = result.map(r => ({ ...r, student_email: r.student_email || 'unknown@example.com' }));
    }

    return res.status(200).json({
      success: true,
      students: students.map(student => ({
        studentEmail: student.student_email,
        studentName: student.student_name || 'Unnamed',
        createdAt: student.created_at,
        updatedAt: student.updated_at
      })),
      sessions: sessions.map(session => ({
        sessionToken: session.session_token,
        studentEmail: session.student_email,
        studentName: session.student_name_from_students || session.student_name || 'Unnamed',
        phoneNumber: session.selected_phone_number ?? null,
        voice: session.selected_voice ?? null,
        ttsProvider: session.tts_provider ?? null,
        callDirection: session.call_direction ?? null,
        useCase: session.use_case ?? null,
        systemPrompt: session.system_prompt ?? null,
        tools: session.tools ?? null,
        hasApiKey: session.has_api_key ?? false,
        hasSystemPrompt: session.has_system_prompt ?? false,
        hasTools: session.has_tools ?? false,
        demoMode: session.demo_mode ?? false,
        // State tracking data
        currentStep: session.current_step ?? 0,
        twilioConnected: session.twilio_connected ?? false,
        openaiConnected: session.openai_connected ?? false,
        callDirectionChosen: session.call_direction_chosen ?? false,
        servicesReady: session.services_ready ?? false,
        step4CodeValidated: session.step4_code_validated ?? false,
        step4Committed: session.step4_committed ?? false,
        step4Deployed: session.step4_deployed ?? false,
        step5CodeValidated: session.step5_code_validated ?? false,
        step5Committed: session.step5_committed ?? false,
        step5Deployed: session.step5_deployed ?? false,
        step6CodeValidated: session.step6_code_validated ?? false,
        step6Committed: session.step6_committed ?? false,
        step6Deployed: session.step6_deployed ?? false,
        systemPromptSaved: session.system_prompt_saved ?? false,
        step7Committed: session.step7_committed ?? false,
        step7Deployed: session.step7_deployed ?? false,
        toolsConfigured: session.tools_configured ?? false,
        step8CodeValidated: session.step8_code_validated ?? false,
        step8Committed: session.step8_committed ?? false,
        step8Deployed: session.step8_deployed ?? false,
        projectDeployed: session.project_deployed ?? false,
        createdAt: session.created_at,
        updatedAt: session.updated_at
      }))
    });

  } catch (error) {
    console.error('List configs error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to list configs'
    });
  }
}
