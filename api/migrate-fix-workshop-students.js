/**
 * Database Migration: Fix workshop_students table structure
 *
 * The track-student-progress API expects a session_token column
 * but the table was created without it.
 *
 * This migration adds the missing session_token column.
 *
 * POST /api/migrate-fix-workshop-students
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

    console.log('🔧 Starting migration: Fix workshop_students table');

    // Check if session_token column exists
    const columnCheck = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'workshop_students'
      AND column_name = 'session_token'
    `;

    if (columnCheck.length > 0) {
      console.log('ℹ️ Column session_token already exists');
      return res.status(200).json({
        success: true,
        message: 'Column session_token already exists - no migration needed',
        alreadyExists: true
      });
    }

    // Add the session_token column
    await sql.unsafe(`
      ALTER TABLE workshop_students
      ADD COLUMN IF NOT EXISTS session_token TEXT UNIQUE
    `);

    console.log('✅ Added session_token column');

    // Verify the column was added
    const verifyColumn = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'workshop_students'
      AND column_name = 'session_token'
    `;

    if (verifyColumn.length === 0) {
      throw new Error('Column was not added successfully');
    }

    return res.status(200).json({
      success: true,
      message: 'Migration complete: session_token column added to workshop_students table',
      details: {
        tableName: 'workshop_students',
        columnAdded: 'session_token',
        columnType: 'TEXT UNIQUE'
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
