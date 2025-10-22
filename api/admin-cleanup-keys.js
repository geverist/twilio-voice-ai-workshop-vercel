/**
 * Admin Cleanup - Delete OpenAI API Keys
 *
 * Instructor-only endpoint to delete all OpenAI API keys from database
 * after a workshop completes. Keeps all other configuration intact.
 *
 * POST /api/admin-cleanup-keys
 * Body: {
 *   adminPassword: string,
 *   dryRun?: boolean  // If true, just show what would be deleted
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
    const { adminPassword, dryRun } = req.body;

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
      console.warn('⚠️ Unauthorized cleanup attempt');
      return res.status(401).json({
        success: false,
        error: 'Invalid admin password'
      });
    }

    console.log('🧹 Admin cleanup requested...');

    // Get count of records with API keys
    const countResult = await sql`
      SELECT COUNT(*) as total_count,
             COUNT(openai_api_key) as keys_count
      FROM student_configs
    `;

    const totalRecords = parseInt(countResult[0].total_count);
    const recordsWithKeys = parseInt(countResult[0].keys_count);

    console.log(`📊 Found ${totalRecords} total records, ${recordsWithKeys} with API keys`);

    if (dryRun) {
      // Dry run - just show what would be affected
      const recordsWithKeysDetails = await sql`
        SELECT
          session_token,
          student_name,
          created_at,
          updated_at,
          CASE WHEN openai_api_key IS NOT NULL THEN 'YES' ELSE 'NO' END as has_key
        FROM student_configs
        WHERE openai_api_key IS NOT NULL
        ORDER BY created_at DESC
      `;

      console.log('🔍 Dry run complete');

      return res.status(200).json({
        success: true,
        dryRun: true,
        totalRecords: totalRecords,
        recordsWithKeys: recordsWithKeys,
        affectedRecords: recordsWithKeysDetails.map(r => ({
          sessionToken: r.session_token.substring(0, 30) + '...',
          studentName: r.student_name,
          createdAt: r.created_at,
          updatedAt: r.updated_at
        }))
      });
    }

    // Actual cleanup - delete all OpenAI API keys
    const updateResult = await sql`
      UPDATE student_configs
      SET openai_api_key = NULL,
          updated_at = NOW()
      WHERE openai_api_key IS NOT NULL
    `;

    console.log(`✅ Cleanup complete: ${updateResult.count} API keys removed`);

    return res.status(200).json({
      success: true,
      dryRun: false,
      totalRecords: totalRecords,
      keysRemoved: updateResult.count,
      message: `Successfully removed ${updateResult.count} OpenAI API keys from database`
    });

  } catch (error) {
    console.error('Cleanup error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to cleanup keys'
    });
  }
}
