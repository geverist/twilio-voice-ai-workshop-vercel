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
    // Check if merged structure exists (with session_token column)
    else if (tableNames.includes('workshop_students')) {
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
          selected_phone_number,
          selected_voice,
          tts_provider,
          CASE WHEN openai_api_key IS NOT NULL THEN true ELSE false END as has_api_key,
          CASE WHEN system_prompt IS NOT NULL THEN true ELSE false END as has_system_prompt,
          CASE WHEN tools IS NOT NULL AND tools::text != '[]' THEN true ELSE false END as has_tools,
          created_at,
          updated_at
        FROM student_configs
        ORDER BY created_at DESC
      `;

      // No student_email in old student_configs, so use unknown
      students = [{ student_email: 'unknown@example.com', student_name: 'Legacy Students', created_at: new Date(), updated_at: new Date() }];
      sessions = result.map(r => ({ ...r, student_email: 'unknown@example.com' }));
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
