/**
 * Admin Delete Sessions
 *
 * Delete entire student sessions or just their API keys (bulk operations)
 * Requires admin password authentication
 *
 * POST /api/admin-delete-sessions
 * Body: {
 *   adminPassword: string,
 *   sessionTokens: string[],
 *   deleteType: 'full' | 'keys-only'  // 'full' deletes entire records, 'keys-only' just nullifies API keys
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
    const { adminPassword, sessionTokens, deleteType } = req.body;

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
      console.warn('⚠️ Unauthorized delete attempt');
      return res.status(401).json({
        success: false,
        error: 'Invalid admin password'
      });
    }

    // Validate inputs
    if (!sessionTokens || !Array.isArray(sessionTokens) || sessionTokens.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'sessionTokens array is required'
      });
    }

    if (!deleteType || !['full', 'keys-only'].includes(deleteType)) {
      return res.status(400).json({
        success: false,
        error: 'deleteType must be either "full" or "keys-only"'
      });
    }

    console.log(`🗑️ Admin delete requested: ${deleteType} for ${sessionTokens.length} sessions`);

    let result;

    if (deleteType === 'keys-only') {
      // Just nullify the API keys
      result = await sql`
        UPDATE student_configs
        SET openai_api_key = NULL,
            updated_at = NOW()
        WHERE session_token = ANY(${sessionTokens})
      `;

      console.log(`✅ Deleted API keys from ${result.count} sessions`);

      return res.status(200).json({
        success: true,
        deleteType: 'keys-only',
        sessionsAffected: result.count,
        message: `Successfully removed API keys from ${result.count} sessions`
      });

    } else {
      // Full delete - remove entire records
      result = await sql`
        DELETE FROM student_configs
        WHERE session_token = ANY(${sessionTokens})
      `;

      console.log(`✅ Deleted ${result.count} complete sessions`);

      return res.status(200).json({
        success: true,
        deleteType: 'full',
        sessionsDeleted: result.count,
        message: `Successfully deleted ${result.count} complete sessions`
      });
    }

  } catch (error) {
    console.error('Delete sessions error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete sessions'
    });
  }
}
