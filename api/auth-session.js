// Session-based authentication for workshop (replaces Twilio Sync)
// Creates secure sessions stored in Postgres instead of Sync

import { sql } from '@vercel/postgres';
import twilio from 'twilio';
import crypto from 'crypto';

export default async function handler(req, res) {
  // Set CORS headers
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

  const { action } = req.body;

  try {
    switch (action) {
      case 'createSession': {
        // Create a new session with Twilio credentials
        const { accountSid, authToken, apiKeySid, apiKeySecret, studentEmail } = req.body;

        // Validate credentials with Twilio
        let client;
        let accountInfo;

        try {
          if (apiKeySid && apiKeySecret) {
            // API Key authentication
            client = twilio(apiKeySid, apiKeySecret, { accountSid });
          } else if (accountSid && authToken) {
            // Account SID + Auth Token
            client = twilio(accountSid, authToken);
          } else {
            return res.status(400).json({
              success: false,
              error: 'Either (accountSid + authToken) or (accountSid + apiKeySid + apiKeySecret) required'
            });
          }

          // Validate credentials by fetching account
          accountInfo = await client.api.accounts(accountSid).fetch();
        } catch (error) {
          return res.status(401).json({
            success: false,
            error: 'Invalid Twilio credentials',
            details: error.message
          });
        }

        // Generate session token
        const sessionId = crypto.randomBytes(32).toString('hex');
        const studentId = studentEmail || `student_${Date.now()}`;
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        // Store session in Postgres
        await sql`
          INSERT INTO workshop_sessions (
            session_id,
            student_id,
            account_sid,
            auth_token,
            api_key_sid,
            api_key_secret,
            created_at,
            expires_at,
            last_activity,
            is_demo_mode
          ) VALUES (
            ${sessionId},
            ${studentId},
            ${accountSid},
            ${authToken || null},
            ${apiKeySid || null},
            ${apiKeySecret || null},
            NOW(),
            ${expiresAt},
            NOW(),
            FALSE
          )
        `;

        // Create or update student record
        await sql`
          INSERT INTO workshop_students (
            student_id,
            student_email,
            twilio_account_sid,
            created_at,
            last_activity
          ) VALUES (
            ${studentId},
            ${studentEmail || `${studentId}@example.com`},
            ${accountSid},
            NOW(),
            NOW()
          )
          ON CONFLICT (student_id)
          DO UPDATE SET
            last_activity = NOW(),
            twilio_account_sid = ${accountSid}
        `;

        // Log session creation event
        await sql`
          INSERT INTO workshop_events (
            student_id,
            session_id,
            event_type,
            event_data,
            created_at
          ) VALUES (
            ${studentId},
            ${sessionId},
            'session_created',
            ${JSON.stringify({ accountSid, method: apiKeySid ? 'api_key' : 'auth_token' })},
            NOW()
          )
        `;

        return res.status(200).json({
          success: true,
          sessionToken: sessionId,
          studentId: studentId,
          accountName: accountInfo.friendlyName,
          expiresAt: expiresAt.toISOString()
        });
      }

      case 'validateSession': {
        // Check if session is still valid
        const { sessionToken } = req.body;

        if (!sessionToken) {
          return res.status(400).json({
            success: false,
            error: 'Session token required'
          });
        }

        const session = await sql`
          SELECT * FROM workshop_sessions
          WHERE session_id = ${sessionToken}
          AND expires_at > NOW()
        `;

        if (session.rows.length === 0) {
          return res.status(401).json({
            success: false,
            error: 'Invalid or expired session'
          });
        }

        // Update last activity
        await sql`
          UPDATE workshop_sessions
          SET last_activity = NOW()
          WHERE session_id = ${sessionToken}
        `;

        return res.status(200).json({
          success: true,
          valid: true,
          studentId: session.rows[0].student_id,
          accountSid: session.rows[0].account_sid,
          expiresAt: session.rows[0].expires_at
        });
      }

      case 'getSessionCredentials': {
        // Internal use: retrieve credentials for a session (for proxy calls)
        const { sessionToken } = req.body;

        if (!sessionToken) {
          return res.status(400).json({
            success: false,
            error: 'Session token required'
          });
        }

        const session = await sql`
          SELECT * FROM workshop_sessions
          WHERE session_id = ${sessionToken}
          AND expires_at > NOW()
        `;

        if (session.rows.length === 0) {
          return res.status(401).json({
            success: false,
            error: 'Invalid or expired session'
          });
        }

        const s = session.rows[0];

        // Update last activity
        await sql`
          UPDATE workshop_sessions
          SET last_activity = NOW()
          WHERE session_id = ${sessionToken}
        `;

        return res.status(200).json({
          success: true,
          accountSid: s.account_sid,
          authToken: s.auth_token,
          apiKeySid: s.api_key_sid,
          apiKeySecret: s.api_key_secret,
          studentId: s.student_id
        });
      }

      case 'destroySession': {
        // Logout - destroy session
        const { sessionToken } = req.body;

        if (!sessionToken) {
          return res.status(400).json({
            success: false,
            error: 'Session token required'
          });
        }

        // Get student ID before deleting
        const session = await sql`
          SELECT student_id FROM workshop_sessions
          WHERE session_id = ${sessionToken}
        `;

        if (session.rows.length > 0) {
          // Log logout event
          await sql`
            INSERT INTO workshop_events (
              student_id,
              session_id,
              event_type,
              created_at
            ) VALUES (
              ${session.rows[0].student_id},
              ${sessionToken},
              'session_destroyed',
              NOW()
            )
          `;
        }

        // Delete session
        await sql`
          DELETE FROM workshop_sessions
          WHERE session_id = ${sessionToken}
        `;

        return res.status(200).json({
          success: true,
          message: 'Session destroyed'
        });
      }

      case 'recordProgress': {
        // Record student progress for a specific step
        const { sessionToken, stepNumber, stepName, completed, timeSpent, codeSubmitted } = req.body;

        // Get student ID from session
        const session = await sql`
          SELECT student_id FROM workshop_sessions
          WHERE session_id = ${sessionToken}
          AND expires_at > NOW()
        `;

        if (session.rows.length === 0) {
          return res.status(401).json({
            success: false,
            error: 'Invalid or expired session'
          });
        }

        const studentId = session.rows[0].student_id;

        // Insert or update step progress
        await sql`
          INSERT INTO workshop_step_progress (
            student_id,
            step_number,
            step_name,
            started_at,
            completed_at,
            time_spent,
            attempts,
            validation_passed,
            code_submitted
          ) VALUES (
            ${studentId},
            ${stepNumber},
            ${stepName},
            NOW(),
            ${completed ? 'NOW()' : null},
            ${timeSpent || 0},
            1,
            ${completed || false},
            ${codeSubmitted || null}
          )
          ON CONFLICT (student_id, step_number)
          DO UPDATE SET
            completed_at = ${completed ? 'NOW()' : 'workshop_step_progress.completed_at'},
            time_spent = workshop_step_progress.time_spent + ${timeSpent || 0},
            attempts = workshop_step_progress.attempts + 1,
            validation_passed = ${completed || false},
            code_submitted = ${codeSubmitted || 'workshop_step_progress.code_submitted'}
        `;

        // Update student's overall progress
        await sql`SELECT update_student_progress(${studentId})`;

        // Log progress event
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
            ${completed ? 'step_completed' : 'step_progress'},
            ${JSON.stringify({ stepNumber, stepName, timeSpent })},
            NOW()
          )
        `;

        return res.status(200).json({
          success: true,
          message: 'Progress recorded'
        });
      }

      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action'
        });
    }
  } catch (error) {
    console.error('Auth session error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
