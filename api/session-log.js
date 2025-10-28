/**
 * Session Logging API
 *
 * Logs student session events for troubleshooting and analytics
 *
 * POST /api/session-log
 * Body: {
 *   sessionToken: string,
 *   eventType: string (navigation|error|action|api_call|state_change),
 *   eventData: object,
 *   studentEmail: string (optional),
 *   timestamp: string (optional - server will add if missing)
 * }
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

  if (!process.env.POSTGRES_URL) {
    return res.status(500).json({
      success: false,
      error: 'Database not configured'
    });
  }

  try {
    // POST: Log an event
    if (req.method === 'POST') {
      const {
        sessionToken,
        eventType,
        eventData,
        studentEmail,
        timestamp
      } = req.body;

      if (!sessionToken || !eventType) {
        return res.status(400).json({
          success: false,
          error: 'sessionToken and eventType are required'
        });
      }

      const eventTimestamp = timestamp || new Date().toISOString();

      // Get student_id if email provided
      let studentId = null;
      if (studentEmail) {
        const studentResult = await sql`
          SELECT student_id FROM students WHERE student_email = ${studentEmail}
        `;
        if (studentResult.length > 0) {
          studentId = studentResult[0].student_id;
        }
      }

      // Insert log entry
      await sql`
        INSERT INTO events (student_id, session_token, event_type, event_data, created_at)
        VALUES (
          ${studentId},
          ${sessionToken},
          ${eventType},
          ${JSON.stringify(eventData)},
          ${eventTimestamp}
        )
      `;

      return res.status(200).json({
        success: true,
        message: 'Event logged successfully'
      });
    }

    // GET: Retrieve session logs
    if (req.method === 'GET') {
      const { sessionToken, studentEmail, eventType, limit } = req.query;

      // Allow fetching all logs if no filters provided (useful for instructor dashboard)
      // Note: In production, you may want to add pagination or admin authentication for this

      let query = sql`
        SELECT
          e.event_id,
          e.session_token,
          e.event_type,
          e.event_data,
          e.created_at,
          s.student_email,
          s.student_name
        FROM events e
        LEFT JOIN students s ON e.student_id = s.student_id
        WHERE 1=1
      `;

      const conditions = [];
      const params = [];

      if (sessionToken) {
        conditions.push(`e.session_token = $${params.length + 1}`);
        params.push(sessionToken);
      }

      if (studentEmail) {
        conditions.push(`s.student_email = $${params.length + 1}`);
        params.push(studentEmail);
      }

      if (eventType) {
        conditions.push(`e.event_type = $${params.length + 1}`);
        params.push(eventType);
      }

      // Build final query
      let queryText = `
        SELECT
          e.event_id,
          e.session_token,
          e.event_type,
          e.event_data,
          e.created_at,
          s.student_email,
          s.student_name
        FROM events e
        LEFT JOIN students s ON e.student_id = s.student_id
      `;

      if (conditions.length > 0) {
        queryText += ' WHERE ' + conditions.join(' AND ');
      }

      queryText += ` ORDER BY e.created_at DESC LIMIT ${parseInt(limit) || 100}`;

      const result = await sql.unsafe(queryText, params);

      return res.status(200).json({
        success: true,
        events: result,
        count: result.length
      });
    }

    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use GET or POST.'
    });

  } catch (error) {
    console.error('Error in session-log:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
}
