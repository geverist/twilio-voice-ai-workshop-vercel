/**
 * Database Migration: Add student_email column to student_configs
 *
 * The tests discovered that the student_configs table is missing
 * the student_email column, causing 500 errors.
 *
 * This migration adds the missing column safely.
 *
 * POST /api/migrate-add-student-email
 * Body: { adminPassword: string }
 */

import postgres from 'postgres';
import { applyCORS, handlePreflightRequest } from './_lib/cors.js';

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
      console.warn('⚠️ Unauthorized migration attempt');
      return res.status(401).json({
        success: false,
        error: 'Invalid admin password'
      });
    }

    console.log('🔧 Starting migration: Add student_email column');

    // Check if column already exists
    const columnCheck = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'student_configs'
      AND column_name = 'student_email'
    `;

    if (columnCheck.length > 0) {
      console.log('ℹ️ Column student_email already exists');
      return res.status(200).json({
        success: true,
        message: 'Column student_email already exists - no migration needed',
        alreadyExists: true
      });
    }

    // Add the missing column
    await sql`
      ALTER TABLE student_configs
      ADD COLUMN student_email TEXT
    `;

    console.log('✅ Migration complete: student_email column added');

    // Verify the column was added
    const verifyColumn = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'student_configs'
      AND column_name = 'student_email'
    `;

    if (verifyColumn.length === 0) {
      throw new Error('Column was not added successfully');
    }

    return res.status(200).json({
      success: true,
      message: 'Migration complete: student_email column added to student_configs table',
      details: {
        tableName: 'student_configs',
        columnAdded: 'student_email',
        columnType: 'TEXT'
      }
    });

  } catch (error) {
    console.error('Migration error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Migration failed',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
