/**
 * Admin Migration: Add exercises column to workshop_students table
 *
 * This migration ensures the workshop_students table has the exercises JSONB column
 * needed for tracking student progress through workshop exercises.
 *
 * Safe to run multiple times - uses IF NOT EXISTS and ADD COLUMN IF NOT EXISTS patterns.
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

    // Authentication - check admin password
    const correctPassword = process.env.ADMIN_PASSWORD;

    if (!correctPassword) {
      return res.status(500).json({
        success: false,
        error: 'Admin password not configured in environment variables'
      });
    }

    if (!adminPassword || adminPassword !== correctPassword) {
      console.warn('⚠️ Unauthorized migration attempt');
      return res.status(401).json({
        success: false,
        error: 'Invalid admin password'
      });
    }

    console.log('🔄 Running progress table migration...');

    const migrationSteps = [];

    // Step 1: Ensure workshop_students table exists with all required columns
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS workshop_students (
          id SERIAL PRIMARY KEY,
          student_email VARCHAR(255) NOT NULL UNIQUE,
          student_name VARCHAR(255),
          exercises JSONB DEFAULT '{}',
          started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          total_time_spent INTEGER DEFAULT 0,
          completion_rate INTEGER DEFAULT 0,
          repo_created BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `;
      migrationSteps.push('✅ Ensured workshop_students table exists');
    } catch (error) {
      migrationSteps.push(`⚠️ Table creation: ${error.message}`);
    }

    // Step 2: Add exercises column if it doesn't exist (for existing tables)
    try {
      await sql`
        ALTER TABLE workshop_students
        ADD COLUMN IF NOT EXISTS exercises JSONB DEFAULT '{}'
      `;
      migrationSteps.push('✅ Added exercises column (if missing)');
    } catch (error) {
      migrationSteps.push(`⚠️ Add exercises column: ${error.message}`);
    }

    // Step 3: Add student_id column if needed (for compatibility with old schema)
    try {
      await sql`
        ALTER TABLE workshop_students
        ADD COLUMN IF NOT EXISTS student_id VARCHAR(64)
      `;
      migrationSteps.push('✅ Added student_id column (if missing)');
    } catch (error) {
      migrationSteps.push(`⚠️ Add student_id column: ${error.message}`);
    }

    // Step 3.5: Add demo_mode column
    try {
      await sql`
        ALTER TABLE workshop_students
        ADD COLUMN IF NOT EXISTS demo_mode BOOLEAN DEFAULT FALSE
      `;
      migrationSteps.push('✅ Added demo_mode column (if missing)');
    } catch (error) {
      migrationSteps.push(`⚠️ Add demo_mode column: ${error.message}`);
    }

    // Step 4: Create indexes for performance
    try {
      await sql`CREATE INDEX IF NOT EXISTS idx_students_email ON workshop_students(student_email)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_students_last_activity ON workshop_students(last_activity DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_students_completion ON workshop_students(completion_rate DESC)`;
      migrationSteps.push('✅ Created performance indexes');
    } catch (error) {
      migrationSteps.push(`⚠️ Indexes: ${error.message}`);
    }

    // Step 5: Create updated_at trigger
    try {
      await sql`
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
      `;

      await sql`
        DROP TRIGGER IF EXISTS update_workshop_students_updated_at ON workshop_students
      `;

      await sql`
        CREATE TRIGGER update_workshop_students_updated_at
          BEFORE UPDATE ON workshop_students
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column()
      `;
      migrationSteps.push('✅ Created updated_at trigger');
    } catch (error) {
      migrationSteps.push(`⚠️ Trigger: ${error.message}`);
    }

    // Step 6: Get current table info
    const tableInfo = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'workshop_students'
      ORDER BY ordinal_position
    `;

    const rowCount = await sql`SELECT COUNT(*) as count FROM workshop_students`;

    console.log('✅ Migration completed successfully');

    return res.status(200).json({
      success: true,
      message: 'Progress table migration completed',
      steps: migrationSteps,
      tableInfo: tableInfo.map(col => ({
        column: col.column_name,
        type: col.data_type,
        nullable: col.is_nullable
      })),
      currentRecords: parseInt(rowCount[0].count)
    });

  } catch (error) {
    console.error('Migration error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Migration failed',
      details: error.toString()
    });
  }
}
