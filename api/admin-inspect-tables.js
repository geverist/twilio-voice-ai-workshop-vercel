/**
 * Admin: Inspect Database Tables
 *
 * Returns the schema of all workshop-related tables
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
    const { adminPassword } = req.body;

    const correctPassword = process.env.ADMIN_PASSWORD;

    if (!correctPassword) {
      return res.status(500).json({
        success: false,
        error: 'Admin password not configured'
      });
    }

    if (!adminPassword || adminPassword !== correctPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid admin password'
      });
    }

    // Get all tables
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name LIKE '%student%' OR table_name LIKE '%session%' OR table_name LIKE '%workshop%'
    `;

    // Get columns for each table
    const tableSchemas = {};
    for (const table of tables) {
      const columns = await sql`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = ${table.table_name}
        ORDER BY ordinal_position
      `;

      const rowCount = await sql`
        SELECT COUNT(*) as count
        FROM ${sql(table.table_name)}
      `;

      tableSchemas[table.table_name] = {
        columns: columns.map(c => ({
          name: c.column_name,
          type: c.data_type,
          nullable: c.is_nullable,
          default: c.column_default
        })),
        rowCount: parseInt(rowCount[0].count)
      };
    }

    return res.status(200).json({
      success: true,
      tables: tableSchemas
    });

  } catch (error) {
    console.error('Inspect error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
