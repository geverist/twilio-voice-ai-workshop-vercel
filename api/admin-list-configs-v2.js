/**
 * Admin: List Student Configs V2 (Unified Schema)
 *
 * Simple, clean endpoint that reads from unified schema only.
 * No more conditional logic for multiple table structures!
 *
 * POST /api/admin-list-configs-v2
 * Body: { adminPassword: string }
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
    const { adminPassword } = req.body;

    // Authentication
    if (!process.env.ADMIN_PASSWORD || adminPassword !== process.env.ADMIN_PASSWORD) {
      console.warn('⚠️  Unauthorized admin list attempt');
      return res.status(401).json({ success: false, error: 'Invalid admin password' });
    }

    // Simple query - just read from unified schema
    const students = await sql`
      SELECT
        student_id,
        student_email,
        student_name,
        github_username,
        created_at,
        updated_at
      FROM students
      ORDER BY created_at DESC
    `;

    const sessions = await sql`
      SELECT
        s.session_token,
        s.student_id,
        st.student_email,
        st.student_name,

        -- Configuration
        s.selected_phone_number,
        s.selected_voice,
        s.tts_provider,
        s.call_direction,
        s.use_case_description,

        -- AI config (check if present, don't return values)
        CASE WHEN s.openai_api_key IS NOT NULL THEN true ELSE false END as has_api_key,
        CASE WHEN s.system_prompt IS NOT NULL THEN true ELSE false END as has_system_prompt,
        CASE WHEN s.tools::text != '[]' THEN true ELSE false END as has_tools,

        -- Progress
        s.demo_mode,
        s.current_step,
        s.completion_rate,

        -- Step status flags
        s.twilio_connected,
        s.openai_connected,
        s.call_direction_chosen,
        s.services_ready,
        s.step4_code_validated,
        s.step4_committed,
        s.step4_deployed,
        s.step5_code_validated,
        s.step5_committed,
        s.step5_deployed,
        s.step6_code_validated,
        s.step6_committed,
        s.step6_deployed,
        s.system_prompt_saved,
        s.step7_committed,
        s.step7_deployed,
        s.tools_configured,
        s.step8_code_validated,
        s.step8_committed,
        s.step8_deployed,
        s.project_deployed,

        -- Timestamps
        s.created_at,
        s.updated_at

      FROM sessions s
      INNER JOIN students st ON s.student_id = st.student_id
      ORDER BY s.created_at DESC
    `;

    // Format for frontend
    return res.status(200).json({
      success: true,
      students: students.map(student => ({
        studentId: student.student_id,
        studentEmail: student.student_email,
        studentName: student.student_name || 'Unnamed',
        githubUsername: student.github_username,
        createdAt: student.created_at,
        updatedAt: student.updated_at
      })),
      sessions: sessions.map(session => ({
        sessionToken: session.session_token,
        studentId: session.student_id,
        studentEmail: session.student_email,
        studentName: session.student_name || 'Unnamed',

        // Configuration
        phoneNumber: session.selected_phone_number,
        voice: session.selected_voice,
        ttsProvider: session.tts_provider,
        callDirection: session.call_direction,
        useCase: session.use_case_description,

        // AI config flags
        hasApiKey: session.has_api_key,
        hasSystemPrompt: session.has_system_prompt,
        hasTools: session.has_tools,

        // Progress
        demoMode: session.demo_mode,
        currentStep: session.current_step,
        completionRate: session.completion_rate,

        // Step status (for detailed dashboard)
        twilioConnected: session.twilio_connected,
        openaiConnected: session.openai_connected,
        callDirectionChosen: session.call_direction_chosen,
        servicesReady: session.services_ready,
        step4CodeValidated: session.step4_code_validated,
        step4Committed: session.step4_committed,
        step4Deployed: session.step4_deployed,
        step5CodeValidated: session.step5_code_validated,
        step5Committed: session.step5_committed,
        step5Deployed: session.step5_deployed,
        step6CodeValidated: session.step6_code_validated,
        step6Committed: session.step6_committed,
        step6Deployed: session.step6_deployed,
        systemPromptSaved: session.system_prompt_saved,
        step7Committed: session.step7_committed,
        step7Deployed: session.step7_deployed,
        toolsConfigured: session.tools_configured,
        step8CodeValidated: session.step8_code_validated,
        step8Committed: session.step8_committed,
        step8Deployed: session.step8_deployed,
        projectDeployed: session.project_deployed,

        createdAt: session.created_at,
        updatedAt: session.updated_at
      }))
    });

  } catch (error) {
    console.error('List configs error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
