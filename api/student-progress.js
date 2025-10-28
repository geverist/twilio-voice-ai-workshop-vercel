/**
 * Student Progress API (Normalized Schema)
 *
 * Replaces track-student-progress.js
 * Uses normalized schema: students -> sessions -> step_progress
 *
 * Endpoints:
 * - POST: Record/update progress for a session
 * - GET: Retrieve progress for a student or session
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

  try {
    if (!process.env.POSTGRES_URL) {
      return res.status(500).json({
        success: false,
        error: 'Database not configured. Please set POSTGRES_URL in environment variables.'
      });
    }

    // GET: Retrieve progress
    if (req.method === 'GET') {
      const { sessionToken, studentEmail, studentId } = req.query;

      // Get progress by session token
      if (sessionToken) {
        const session = await sql`
          SELECT
            s.*,
            st.student_email,
            st.student_name,
            st.github_username,
            (
              SELECT json_agg(
                json_build_object(
                  'stepNumber', step_number,
                  'stepName', step_name,
                  'completed', validation_passed,
                  'startedAt', started_at,
                  'completedAt', completed_at,
                  'timeSpent', time_spent,
                  'attempts', attempts
                )
                ORDER BY step_number
              )
              FROM step_progress
              WHERE session_token = s.session_token
            ) as step_progress
          FROM sessions s
          JOIN students st ON s.student_id = st.student_id
          WHERE s.session_token = ${sessionToken}
        `;

        if (session.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Session not found'
          });
        }

        return res.status(200).json({
          success: true,
          progress: session[0]
        });
      }

      // Get all sessions for a student by email
      if (studentEmail) {
        const sessions = await sql`
          SELECT
            s.*,
            st.student_name,
            st.student_email,
            (
              SELECT json_agg(
                json_build_object(
                  'stepNumber', step_number,
                  'stepName', step_name,
                  'completed', validation_passed,
                  'completedAt', completed_at,
                  'timeSpent', time_spent
                )
                ORDER BY step_number
              )
              FROM step_progress
              WHERE session_token = s.session_token
            ) as step_progress
          FROM sessions s
          JOIN students st ON s.student_id = st.student_id
          WHERE st.student_email = ${studentEmail}
          ORDER BY s.last_activity DESC
        `;

        return res.status(200).json({
          success: true,
          sessions: sessions
        });
      }

      // Get student by student_id
      if (studentId) {
        const sessions = await sql`
          SELECT
            s.*,
            st.student_name,
            st.student_email,
            (
              SELECT json_agg(
                json_build_object(
                  'stepNumber', step_number,
                  'stepName', step_name,
                  'completed', validation_passed,
                  'completedAt', completed_at,
                  'timeSpent', time_spent
                )
                ORDER BY step_number
              )
              FROM step_progress
              WHERE session_token = s.session_token
            ) as step_progress
          FROM sessions s
          JOIN students st ON s.student_id = st.student_id
          WHERE st.student_id = ${studentId}
          ORDER BY s.last_activity DESC
        `;

        return res.status(200).json({
          success: true,
          sessions: sessions
        });
      }

      return res.status(400).json({
        success: false,
        error: 'sessionToken, studentEmail, or studentId parameter required'
      });
    }

    // POST: Update progress
    if (req.method === 'POST') {
      const {
        sessionToken,
        studentEmail,
        studentName,
        stepNumber,
        stepName,
        completed,
        timeSpent,
        codeSubmitted,
        deploymentUrl,
        demoMode
      } = req.body;

      if (!sessionToken) {
        return res.status(400).json({
          success: false,
          error: 'sessionToken is required'
        });
      }

      // Email is optional - if not provided, track as anonymous
      const email = studentEmail || null;
      const name = studentName || (email ? email : 'Anonymous Student');

      let studentId;

      if (email) {
        // Get or create student with email
        const student = await sql`
          INSERT INTO students (student_email, student_name)
          VALUES (${email}, ${name})
          ON CONFLICT (student_email)
          DO UPDATE SET
            student_name = COALESCE(EXCLUDED.student_name, students.student_name),
            updated_at = NOW()
          RETURNING student_id
        `;
        studentId = student[0].student_id;
      } else {
        // Create anonymous student (no email - sessionToken is the identifier)
        const student = await sql`
          INSERT INTO students (student_email, student_name)
          VALUES (${`anonymous_${sessionToken.substring(0, 16)}`}, ${name})
          ON CONFLICT (student_email)
          DO UPDATE SET
            student_name = COALESCE(EXCLUDED.student_name, students.student_name),
            updated_at = NOW()
          RETURNING student_id
        `;
        studentId = student[0].student_id;
      }

      // Get or create session
      await sql`
        INSERT INTO sessions (session_token, student_id)
        VALUES (${sessionToken}, ${studentId})
        ON CONFLICT (session_token)
        DO UPDATE SET
          last_activity = NOW()
      `;

      // Update step progress if step info provided
      if (stepNumber !== undefined && stepName) {
        await sql`
          INSERT INTO step_progress (
            session_token,
            student_id,
            step_number,
            step_name,
            completed_at,
            time_spent,
            attempts,
            validation_passed,
            code_submitted,
            deployment_url
          )
          VALUES (
            ${sessionToken},
            ${studentId},
            ${stepNumber},
            ${stepName},
            ${completed ? new Date() : null},
            ${timeSpent || 0},
            1,
            ${completed || false},
            ${codeSubmitted},
            ${deploymentUrl}
          )
          ON CONFLICT (session_token, step_number)
          DO UPDATE SET
            completed_at = ${completed ? new Date() : step_progress.completed_at},
            time_spent = step_progress.time_spent + ${timeSpent || 0},
            attempts = step_progress.attempts + 1,
            validation_passed = ${completed || false},
            code_submitted = COALESCE(${codeSubmitted}, step_progress.code_submitted),
            deployment_url = COALESCE(${deploymentUrl}, step_progress.deployment_url),
            updated_at = NOW()
        `;
      }

      // Update session overall progress
      await sql`SELECT update_session_progress(${sessionToken})`;

      // Log event
      await sql`
        INSERT INTO events (student_id, session_token, event_type, event_data)
        VALUES (
          ${studentId},
          ${sessionToken},
          ${completed ? 'step_completed' : 'step_progress'},
          ${JSON.stringify({ stepNumber, stepName, timeSpent })}
        )
      `;

      // Fetch updated progress
      const updatedSession = await sql`
        SELECT
          s.*,
          st.student_email,
          st.student_name,
          (
            SELECT json_agg(
              json_build_object(
                'stepNumber', step_number,
                'stepName', step_name,
                'completed', validation_passed,
                'timeSpent', time_spent,
                'attempts', attempts
              )
              ORDER BY step_number
            )
            FROM step_progress
            WHERE session_token = s.session_token
          ) as step_progress
        FROM sessions s
        JOIN students st ON s.student_id = st.student_id
        WHERE s.session_token = ${sessionToken}
      `;

      return res.status(200).json({
        success: true,
        message: 'Progress updated successfully',
        progress: updatedSession[0]
      });
    }

    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use GET or POST.'
    });

  } catch (error) {
    console.error('Error in student-progress:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
