/**
 * Admin: Cleanup Old Tables After Migration
 *
 * Safely renames old tables after successful migration to unified schema.
 * Does NOT drop tables - renames them with _backup_ suffix for safety.
 *
 * POST /api/admin-cleanup-old-tables
 * Body: {
 *   adminPassword: string,
 *   confirmText: "DELETE OLD TABLES" (exact match required)
 * }
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

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { adminPassword, confirmText } = req.body;

    // Authentication
    if (!process.env.ADMIN_PASSWORD || adminPassword !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ success: false, error: 'Invalid admin password' });
    }

    // Confirmation check
    if (confirmText !== 'DELETE OLD TABLES') {
      return res.status(400).json({
        success: false,
        error: 'Confirmation text must be exactly: DELETE OLD TABLES'
      });
    }

    const results = [];
    const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');

    // Check if unified schema exists
    const unifiedTables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('students', 'sessions')
    `;

    if (unifiedTables.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Unified schema not found. Cannot cleanup old tables before migration is complete.'
      });
    }

    results.push('✅ Unified schema verified (students, sessions tables exist)');

    // Check data counts
    const studentCount = await sql`SELECT COUNT(*) as count FROM students`;
    const sessionCount = await sql`SELECT COUNT(*) as count FROM sessions`;

    results.push(`📊 Unified schema has ${studentCount[0].count} students and ${sessionCount[0].count} sessions`);

    if (studentCount[0].count === 0 || sessionCount[0].count === 0) {
      return res.status(400).json({
        success: false,
        error: 'Unified schema appears empty. Please verify migration completed successfully before cleanup.',
        results
      });
    }

    // Get list of old tables to rename
    const oldTables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('workshop_students', 'student_configs', 'workshop_sessions')
    `;

    if (oldTables.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No old tables found - cleanup already complete or tables never existed',
        results
      });
    }

    results.push(`📋 Found ${oldTables.length} old tables to backup`);

    // Rename each old table
    for (const table of oldTables) {
      const oldName = table.table_name;
      const newName = `${oldName}_backup_${timestamp}`;

      try {
        // Check if backup already exists
        const backupExists = await sql`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = ${newName}
        `;

        if (backupExists.length > 0) {
          results.push(`⚠️  Backup already exists: ${newName}`);
          continue;
        }

        // Rename table
        await sql.unsafe(`ALTER TABLE ${oldName} RENAME TO ${newName}`);
        results.push(`✅ Renamed ${oldName} → ${newName}`);

      } catch (error) {
        console.error(`Error renaming ${oldName}:`, error);
        results.push(`❌ Failed to rename ${oldName}: ${error.message}`);
      }
    }

    // Provide instructions for permanent deletion
    const deletionInstructions = oldTables.map(t => {
      const backupName = `${t.table_name}_backup_${timestamp}`;
      return `DROP TABLE IF EXISTS ${backupName} CASCADE;`;
    }).join('\n');

    return res.status(200).json({
      success: true,
      message: 'Old tables renamed successfully (not deleted)',
      results,
      backupTables: oldTables.map(t => `${t.table_name}_backup_${timestamp}`),
      note: 'Old tables have been renamed with _backup_ suffix. They are NOT deleted and can still be recovered.',
      permanentDeletionSQL: deletionInstructions,
      reminder: '⚠️  After 30+ days of successful operation, you can permanently delete backup tables using the SQL above.'
    });

  } catch (error) {
    console.error('Cleanup error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      details: error.stack
    });
  }
}
