/**
 * Admin Delete Student/Sessions API
 *
 * Provides multiple delete options:
 * 1. Delete specific session(s) by session_token
 * 2. Delete ALL sessions for a student by email
 * 3. Delete API keys only (preserving other data)
 * 4. Complete deletion of all data
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
    const {
      adminPassword,
      deleteType,      // 'session', 'student', 'keys-only'
      sessionTokens,   // Array of session tokens to delete
      studentEmail     // Email to delete all sessions for
    } = req.body;

    // Authentication
    const correctPassword = process.env.ADMIN_PASSWORD;

    if (!correctPassword) {
      return res.status(500).json({
        success: false,
        error: 'Admin password not configured in environment variables'
      });
    }

    if (!adminPassword || adminPassword !== correctPassword) {
      console.warn('⚠️ Unauthorized delete attempt');
      return res.status(401).json({
        success: false,
        error: 'Invalid admin password'
      });
    }

    // Validate inputs
    if (!deleteType) {
      return res.status(400).json({
        success: false,
        error: 'deleteType is required (session, student, or keys-only)'
      });
    }

    let deletedCount = 0;
    let message = '';

    // Option 1: Delete specific sessions
    if (deleteType === 'session' || deleteType === 'full') {
      if (!sessionTokens || sessionTokens.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'sessionTokens array is required for session deletion'
        });
      }

      console.log(`🗑️ Deleting ${sessionTokens.length} session(s)...`);

      for (const token of sessionTokens) {
        const result = await sql`
          DELETE FROM workshop_students
          WHERE session_token = ${token}
        `;
        deletedCount += result.count || 0;
      }

      message = `Successfully deleted ${deletedCount} session(s)`;
    }

    // Option 2: Delete ALL sessions for a student
    else if (deleteType === 'student') {
      if (!studentEmail) {
        return res.status(400).json({
          success: false,
          error: 'studentEmail is required for student deletion'
        });
      }

      console.log(`🗑️ Deleting ALL sessions for student: ${studentEmail}...`);

      const result = await sql`
        DELETE FROM workshop_students
        WHERE student_email = ${studentEmail}
      `;

      deletedCount = result.count || 0;
      message = `Successfully deleted ${deletedCount} session(s) for student ${studentEmail}`;
    }

    // Option 3: Delete API keys only (preserve all other data)
    else if (deleteType === 'keys-only') {
      if (!sessionTokens || sessionTokens.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'sessionTokens array is required for keys-only deletion'
        });
      }

      console.log(`🔑 Deleting API keys from ${sessionTokens.length} session(s)...`);

      for (const token of sessionTokens) {
        const result = await sql`
          UPDATE workshop_students
          SET openai_api_key = NULL
          WHERE session_token = ${token}
        `;
        deletedCount += result.count || 0;
      }

      message = `Successfully removed API keys from ${deletedCount} session(s)`;
    }

    else {
      return res.status(400).json({
        success: false,
        error: 'Invalid deleteType. Must be: session, student, or keys-only'
      });
    }

    console.log(`✅ ${message}`);

    return res.status(200).json({
      success: true,
      message: message,
      deletedCount: deletedCount
    });

  } catch (error) {
    console.error('Delete error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Delete operation failed',
      details: error.toString()
    });
  }
}
