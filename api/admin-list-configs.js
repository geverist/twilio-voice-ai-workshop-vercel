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
        AND column_name IN ('selected_phone_number', 'selected_voice', 'session_token')
      `;

      const hasRequiredColumns = sessionColumns.length >= 2; // At least session_token and one config column

      if (!hasRequiredColumns) {
        // Sessions table exists but doesn't have the right structure
        // Fall through to check workshop_students instead
        console.warn('⚠️ Sessions table exists but missing required columns, checking workshop_students');
        // Reset students/sessions so we fall through to workshop_students check
        students = [];
        sessions = [];
      } else {
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

        sessions = await sql`
          SELECT
            session_token,
            student_email,
            selected_phone_number,
            selected_voice,
            tts_provider,
            CASE WHEN openai_api_key IS NOT NULL THEN true ELSE false END as has_api_key,
            CASE WHEN system_prompt IS NOT NULL THEN true ELSE false END as has_system_prompt,
            CASE WHEN tools IS NOT NULL AND tools::text != '[]' THEN true ELSE false END as has_tools,
            created_at,
            updated_at
          FROM sessions
          ORDER BY created_at DESC
        `;
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
        // Has session_token - use merged structure
        const result = await sql`
          SELECT
            session_token,
            student_email,
            student_name,
            selected_phone_number,
            selected_voice,
            tts_provider,
            CASE WHEN openai_api_key IS NOT NULL THEN true ELSE false END as has_api_key,
            CASE WHEN system_prompt IS NOT NULL THEN true ELSE false END as has_system_prompt,
            CASE WHEN tools IS NOT NULL AND tools::text != '[]' THEN true ELSE false END as has_tools,
            created_at,
            updated_at
          FROM workshop_students
          ORDER BY created_at DESC
        `;

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
      } else {
        // Old structure - student_email is PK, no session_token
        const result = await sql`
          SELECT
            student_email,
            student_name,
            selected_phone_number,
            selected_voice,
            tts_provider,
            CASE WHEN openai_api_key IS NOT NULL THEN true ELSE false END as has_api_key,
            CASE WHEN system_prompt IS NOT NULL THEN true ELSE false END as has_system_prompt,
            CASE WHEN tools IS NOT NULL AND tools::text != '[]' THEN true ELSE false END as has_tools,
            created_at,
            updated_at
          FROM workshop_students
          ORDER BY created_at DESC
        `;

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
    // Fallback to student_configs if it exists
    else if (tableNames.includes('student_configs')) {
      const result = await sql`
        SELECT
          session_token,
          student_name,
          student_email,
          selected_phone_number,
          selected_voice,
          tts_provider,
          CASE WHEN openai_api_key IS NOT NULL THEN true ELSE false END as has_api_key,
          CASE WHEN system_prompt IS NOT NULL THEN true ELSE false END as has_system_prompt,
          CASE WHEN tools IS NOT NULL AND tools::text != '[]' THEN true ELSE false END as has_tools,
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
        FROM student_configs
        ORDER BY created_at DESC
      `;

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
        studentName: students.find(s => s.student_email === session.student_email)?.student_name || 'Unnamed',
        phoneNumber: session.selected_phone_number,
        voice: session.selected_voice,
        ttsProvider: session.tts_provider,
        hasApiKey: session.has_api_key,
        hasSystemPrompt: session.has_system_prompt,
        hasTools: session.has_tools,
        // State tracking data
        currentStep: session.current_step || 0,
        twilioConnected: session.twilio_connected || false,
        openaiConnected: session.openai_connected || false,
        callDirectionChosen: session.call_direction_chosen || false,
        servicesReady: session.services_ready || false,
        step4CodeValidated: session.step4_code_validated || false,
        step4Committed: session.step4_committed || false,
        step4Deployed: session.step4_deployed || false,
        step5CodeValidated: session.step5_code_validated || false,
        step5Committed: session.step5_committed || false,
        step5Deployed: session.step5_deployed || false,
        step6CodeValidated: session.step6_code_validated || false,
        step6Committed: session.step6_committed || false,
        step6Deployed: session.step6_deployed || false,
        systemPromptSaved: session.system_prompt_saved || false,
        step7Committed: session.step7_committed || false,
        step7Deployed: session.step7_deployed || false,
        toolsConfigured: session.tools_configured || false,
        step8CodeValidated: session.step8_code_validated || false,
        step8Committed: session.step8_committed || false,
        step8Deployed: session.step8_deployed || false,
        projectDeployed: session.project_deployed || false,
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
