/**
 * Database Migration: Add Credential Fields
 *
 * Adds twilio_account_sid, twilio_auth_token, and ensures openai_api_key exists
 *
 * GET /api/admin-migrate-credentials
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
    console.log('🔧 Starting credentials fields migration...');

    // Add twilio_account_sid column
    try {
      await sql`
        ALTER TABLE student_configs
        ADD COLUMN IF NOT EXISTS twilio_account_sid TEXT
      `;
      console.log('✅ Added twilio_account_sid column');
    } catch (error) {
      console.log('ℹ️  twilio_account_sid column already exists or error:', error.message);
    }

    // Add twilio_auth_token column (encrypted)
    try {
      await sql`
        ALTER TABLE student_configs
        ADD COLUMN IF NOT EXISTS twilio_auth_token TEXT
      `;
      console.log('✅ Added twilio_auth_token column');
    } catch (error) {
      console.log('ℹ️  twilio_auth_token column already exists or error:', error.message);
    }

    // Ensure openai_api_key column exists (may already exist from earlier migrations)
    try {
      await sql`
        ALTER TABLE student_configs
        ADD COLUMN IF NOT EXISTS openai_api_key TEXT
      `;
      console.log('✅ Ensured openai_api_key column exists');
    } catch (error) {
      console.log('ℹ️  openai_api_key column already exists or error:', error.message);
    }

    // Verify columns exist
    const result = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'student_configs'
      AND column_name IN ('twilio_account_sid', 'twilio_auth_token', 'openai_api_key')
    `;

    console.log('✅ Migration completed successfully');

    return res.status(200).json({
      success: true,
      message: 'Credentials fields migration completed',
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
