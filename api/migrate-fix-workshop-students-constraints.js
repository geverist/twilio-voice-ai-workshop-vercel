/**
 * Database Migration: Fix workshop_students table constraints
 *
 * The workshop_students table has incorrect constraints:
 * - student_email should NOT be unique (students can have multiple sessions)
 * - session_token should be the primary key
 *
 * This migration fixes the constraints.
 *
 * POST /api/migrate-fix-workshop-students-constraints
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

    console.log('🔧 Starting migration: Fix workshop_students constraints');

    const changes = [];

    // Check if student_email has a unique constraint
    const emailConstraints = await sql`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'workshop_students'
      AND constraint_type = 'UNIQUE'
      AND constraint_name LIKE '%student_email%'
    `;

    // Drop unique constraint on student_email if it exists
    for (const constraint of emailConstraints) {
      try {
        await sql.unsafe(`ALTER TABLE workshop_students DROP CONSTRAINT ${constraint.constraint_name}`);
        console.log(`✅ Dropped unique constraint: ${constraint.constraint_name}`);
        changes.push(`Dropped unique constraint on student_email: ${constraint.constraint_name}`);
      } catch (error) {
        console.warn(`⚠️ Could not drop constraint ${constraint.constraint_name}:`, error.message);
      }
    }

    // Check if session_token is the primary key
    const pkConstraints = await sql`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'workshop_students'
      AND constraint_type = 'PRIMARY KEY'
    `;

    if (pkConstraints.length === 0) {
      // No primary key - add session_token as primary key
      try {
        // First ensure session_token is NOT NULL
        await sql.unsafe(`ALTER TABLE workshop_students ALTER COLUMN session_token SET NOT NULL`);
        console.log('✅ Set session_token to NOT NULL');

        await sql.unsafe(`ALTER TABLE workshop_students ADD PRIMARY KEY (session_token)`);
        console.log('✅ Added primary key on session_token');
        changes.push('Added primary key constraint on session_token');
      } catch (error) {
        console.warn('⚠️ Could not add primary key:', error.message);
        changes.push(`Warning: Could not add primary key - ${error.message}`);
      }
    } else {
      console.log('ℹ️ Primary key already exists:', pkConstraints[0].constraint_name);
      changes.push('Primary key already exists');
    }

    // Verify session_token has unique constraint (either PK or explicit UNIQUE)
    const sessionTokenConstraints = await sql`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'workshop_students'
      AND (constraint_name LIKE '%session_token%'
           OR constraint_type = 'PRIMARY KEY')
    `;

    if (sessionTokenConstraints.length === 0) {
      // Add unique constraint to session_token
      try {
        await sql.unsafe(`ALTER TABLE workshop_students ADD CONSTRAINT workshop_students_session_token_key UNIQUE (session_token)`);
        console.log('✅ Added unique constraint on session_token');
        changes.push('Added unique constraint on session_token');
      } catch (error) {
        console.warn('⚠️ Could not add unique constraint:', error.message);
        changes.push(`Warning: Could not add unique constraint - ${error.message}`);
      }
    }

    if (changes.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Table constraints are already correct - no migration needed',
        alreadyCorrect: true
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Migration complete: Fixed workshop_students table constraints',
      details: {
        tableName: 'workshop_students',
        changes: changes
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
