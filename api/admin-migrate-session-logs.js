/**
 * Database Migration: Add Session Logs Tables
 *
 * Creates students and events tables for session logging
 *
 * GET /api/admin-migrate-session-logs
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
    console.log('🔧 Starting session logs tables migration...');

    // Create students table
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS students (
          student_id SERIAL PRIMARY KEY,
          student_email TEXT UNIQUE NOT NULL,
          student_name TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `;
      console.log('✅ Created students table');
    } catch (error) {
      console.log('ℹ️  students table already exists or error:', error.message);
    }

    // Create events table
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS events (
          event_id SERIAL PRIMARY KEY,
          student_id INTEGER REFERENCES students(student_id),
          session_token TEXT,
          event_type TEXT NOT NULL,
          event_data JSONB,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `;
      console.log('✅ Created events table');
    } catch (error) {
      console.log('ℹ️  events table already exists or error:', error.message);
    }

    // Verify tables exist
    const studentsTables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('students', 'events')
    `;

    console.log('✅ Migration completed successfully');

    return res.status(200).json({
      success: true,
      message: 'Session logs tables migration completed',
      tables_created: studentsTables.map(t => t.table_name)
    });

  } catch (error) {
    console.error('❌ Migration error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Migration failed'
    });
  }
}
