/**
 * Admin: Clear All Student Data
 *
 * Clears all student and session data from all tables
 * Requires admin password authentication
 *
 * POST /api/admin-clear-all-data
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

    // Authentication
    const correctPassword = process.env.ADMIN_PASSWORD;

    if (!correctPassword) {
      return res.status(500).json({
        success: false,
        error: 'Admin password not configured in environment variables'
      });
    }

    if (!adminPassword || adminPassword !== correctPassword) {
      console.warn('⚠️ Unauthorized clear all data attempt');
      return res.status(401).json({
        success: false,
        error: 'Invalid admin password'
      });
    }

    console.log('🗑️ Clearing all student and session data...');

    const results = [];

    // Clear sessions table (if exists)
    try {
      const sessionsResult = await sql`TRUNCATE TABLE sessions CASCADE`;
      results.push('✅ Cleared sessions table');
    } catch (error) {
      if (!error.message.includes('does not exist')) {
        results.push(`⚠️ Sessions: ${error.message}`);
      }
    }

    // Clear students table (if exists)
    try {
      const studentsResult = await sql`TRUNCATE TABLE students CASCADE`;
      results.push('✅ Cleared students table');
    } catch (error) {
      if (!error.message.includes('does not exist')) {
        results.push(`⚠️ Students: ${error.message}`);
      }
    }

    // Clear workshop_students table (if exists)
    try {
      const workshopResult = await sql`DELETE FROM workshop_students`;
      results.push(`✅ Cleared workshop_students table (${workshopResult.count || 0} rows)`);
    } catch (error) {
      if (!error.message.includes('does not exist')) {
        results.push(`⚠️ Workshop_students: ${error.message}`);
      }
    }

    // Clear student_configs table (if exists)
    try {
      const configsResult = await sql`DELETE FROM student_configs`;
      results.push(`✅ Cleared student_configs table (${configsResult.count || 0} rows)`);
    } catch (error) {
      if (!error.message.includes('does not exist')) {
        results.push(`⚠️ Student_configs: ${error.message}`);
      }
    }

    console.log('✅ All student data cleared successfully');

    return res.status(200).json({
      success: true,
      message: 'All student and session data cleared successfully',
      results: results
    });

  } catch (error) {
    console.error('Clear all data error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to clear data'
    });
  }
}
