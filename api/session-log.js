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

      // Ensure tables exist before inserting
      try {
        await sql`
          CREATE TABLE IF NOT EXISTS students (
            student_id SERIAL PRIMARY KEY,
            student_email TEXT UNIQUE NOT NULL,
            student_name TEXT,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `;

        await sql`
          CREATE TABLE IF NOT EXISTS events (
            event_id SERIAL PRIMARY KEY,
            student_id INTEGER REFERENCES students(student_id),
            session_token TEXT,
            event_type TEXT NOT NULL,
            event_data JSONB,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `;
      } catch (tableError) {
        console.error('⚠️ Error ensuring session log tables exist:', tableError);
        // Continue anyway
      }

      // Get student_id if email provided
      let studentId = null;
      if (studentEmail) {
        try {
          const studentResult = await sql`
            SELECT student_id FROM students WHERE student_email = ${studentEmail}
          `;
          if (studentResult.length > 0) {
            studentId = studentResult[0].student_id;
          }
        } catch (studentError) {
          console.error('⚠️ Error looking up student:', studentError);
          // Continue without student_id
        }
      }

      // Insert log entry
      try {
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
      } catch (insertError) {
        console.error('❌ Error inserting event log:', insertError);
        return res.status(500).json({
          success: false,
          error: 'Failed to log event',
          message: insertError.message
        });
      }
    }

    // GET: Retrieve session logs
    if (req.method === 'GET') {
      const { sessionToken, studentEmail, eventType, limit } = req.query;

      console.log('📋 Loading session logs with filters:', { sessionToken, studentEmail, eventType, limit });

      // Allow fetching all logs if no filters provided (useful for instructor dashboard)
      // Note: In production, you may want to add pagination or admin authentication for this

      // Ensure tables exist with better error handling
      try {
        await sql`
          CREATE TABLE IF NOT EXISTS students (
            student_id SERIAL PRIMARY KEY,
            student_email TEXT UNIQUE NOT NULL,
            student_name TEXT,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `;

        await sql`
          CREATE TABLE IF NOT EXISTS events (
            event_id SERIAL PRIMARY KEY,
            student_id INTEGER REFERENCES students(student_id),
            session_token TEXT,
            event_type TEXT NOT NULL,
            event_data JSONB,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `;
        console.log('✅ Session log tables verified/created');
      } catch (tableError) {
        console.error('❌ Error creating session log tables:', tableError);
        return res.status(500).json({
          success: false,
          error: 'Failed to create database tables',
          message: tableError.message
        });
      }

      // Build query with filters
      const limitValue = parseInt(limit) || 100;
      let result;

      try {
        if (sessionToken && studentEmail && eventType) {
        // All three filters
        result = await sql`
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
          WHERE e.session_token = ${sessionToken}
            AND s.student_email = ${studentEmail}
            AND e.event_type = ${eventType}
          ORDER BY e.created_at DESC
          LIMIT ${limitValue}
        `;
      } else if (sessionToken && studentEmail) {
        // Session and email
        result = await sql`
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
          WHERE e.session_token = ${sessionToken}
            AND s.student_email = ${studentEmail}
          ORDER BY e.created_at DESC
          LIMIT ${limitValue}
        `;
      } else if (sessionToken && eventType) {
        // Session and event type
        result = await sql`
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
          WHERE e.session_token = ${sessionToken}
            AND e.event_type = ${eventType}
          ORDER BY e.created_at DESC
          LIMIT ${limitValue}
        `;
      } else if (studentEmail && eventType) {
        // Email and event type
        result = await sql`
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
          WHERE s.student_email = ${studentEmail}
            AND e.event_type = ${eventType}
          ORDER BY e.created_at DESC
          LIMIT ${limitValue}
        `;
      } else if (sessionToken) {
        // Session only
        result = await sql`
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
          WHERE e.session_token = ${sessionToken}
          ORDER BY e.created_at DESC
          LIMIT ${limitValue}
        `;
      } else if (studentEmail) {
        // Email only
        result = await sql`
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
          WHERE s.student_email = ${studentEmail}
          ORDER BY e.created_at DESC
          LIMIT ${limitValue}
        `;
      } else if (eventType) {
        // Event type only
        result = await sql`
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
          WHERE e.event_type = ${eventType}
          ORDER BY e.created_at DESC
          LIMIT ${limitValue}
        `;
      } else {
        // No filters - all logs
        result = await sql`
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
          ORDER BY e.created_at DESC
          LIMIT ${limitValue}
        `;
        }

        console.log(`✅ Found ${result.length} events`);

        return res.status(200).json({
          success: true,
          events: result,
          count: result.length
        });
      } catch (queryError) {
        console.error('❌ Error executing query:', queryError);
        return res.status(500).json({
          success: false,
          error: 'Failed to retrieve logs',
          message: queryError.message
        });
      }
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
