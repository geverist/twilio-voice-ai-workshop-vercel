/**
 * Database Migration: Add Memory Fields
 *
 * Adds enable_persistent_memory and memory_retention_days columns to student_configs table
 *
 * GET /api/admin-migrate-memory-fields
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

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    console.log('🔧 Starting memory fields migration...');

    // Add enable_persistent_memory column
    try {
      await sql`
        ALTER TABLE student_configs
        ADD COLUMN IF NOT EXISTS enable_persistent_memory BOOLEAN DEFAULT false
      `;
      console.log('✅ Added enable_persistent_memory column');
    } catch (error) {
      console.log('ℹ️  enable_persistent_memory column already exists or error:', error.message);
    }

    // Add memory_retention_days column
    try {
      await sql`
        ALTER TABLE student_configs
        ADD COLUMN IF NOT EXISTS memory_retention_days INTEGER DEFAULT 30
      `;
      console.log('✅ Added memory_retention_days column');
    } catch (error) {
      console.log('ℹ️  memory_retention_days column already exists or error:', error.message);
    }

    // Verify columns exist
    const result = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'student_configs'
      AND column_name IN ('enable_persistent_memory', 'memory_retention_days')
    `;

    console.log('✅ Migration completed successfully');

    return res.status(200).json({
      success: true,
      message: 'Memory fields migration completed',
      columns_added: result.map(r => r.column_name)
    });

  } catch (error) {
    console.error('❌ Migration error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Migration failed'
    });
  }
}
