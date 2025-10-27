#!/usr/bin/env node

/**
 * Check Old Tables for Data
 *
 * This script checks if workshop_students and student_configs tables
 * exist and have data that needs to be migrated.
 */

import postgres from 'postgres';

const POSTGRES_URL = process.env.POSTGRES_URL || 'postgres://107e2d7c20df9f4d880bc758127a4c81ae6335cde27a21a8ca5c0f886414356e:sk_HiqJU4IYIfGyDbStEMhmd@db.prisma.io:5432/postgres?sslmode=require';

const sql = postgres(POSTGRES_URL, {
  ssl: 'require',
  max: 1
});

console.log('🔍 Checking for data in old tables...\n');

async function checkOldTables() {
  try {
    // Check which tables exist
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('workshop_students', 'student_configs', 'students', 'sessions')
      ORDER BY table_name
    `;

    console.log('📋 Existing tables:');
    tables.forEach(t => console.log(`  • ${t.table_name}`));
    console.log('');

    const tableNames = tables.map(t => t.table_name);

    // Check workshop_students
    if (tableNames.includes('workshop_students')) {
      const wsCount = await sql`SELECT COUNT(*) as count FROM workshop_students`;
      const wsWithSessions = await sql`
        SELECT COUNT(*) as count FROM workshop_students
        WHERE session_token IS NOT NULL
      `;

      console.log('📊 workshop_students:');
      console.log(`  • Total rows: ${wsCount[0].count}`);
      console.log(`  • With session_token: ${wsWithSessions[0].count}`);

      if (wsCount[0].count > 0) {
        const sample = await sql`SELECT * FROM workshop_students LIMIT 1`;
        console.log(`  • Sample email: ${sample[0]?.student_email || 'N/A'}`);
      }
      console.log('');
    } else {
      console.log('⚠️  workshop_students table does NOT exist\n');
    }

    // Check student_configs
    if (tableNames.includes('student_configs')) {
      const scCount = await sql`SELECT COUNT(*) as count FROM student_configs`;
      const scWithSessions = await sql`
        SELECT COUNT(*) as count FROM student_configs
        WHERE session_token IS NOT NULL
      `;

      console.log('📊 student_configs:');
      console.log(`  • Total rows: ${scCount[0].count}`);
      console.log(`  • With session_token: ${scWithSessions[0].count}`);

      if (scCount[0].count > 0) {
        const sample = await sql`SELECT * FROM student_configs LIMIT 1`;
        console.log(`  • Sample email: ${sample[0]?.student_email || 'N/A'}`);
      }
      console.log('');
    } else {
      console.log('⚠️  student_configs table does NOT exist\n');
    }

    // Check new tables
    if (tableNames.includes('students')) {
      const studentsCount = await sql`SELECT COUNT(*) as count FROM students`;
      console.log('📊 students (new):');
      console.log(`  • Total rows: ${studentsCount[0].count}`);
      console.log('');
    }

    if (tableNames.includes('sessions')) {
      const sessionsCount = await sql`SELECT COUNT(*) as count FROM sessions`;
      console.log('📊 sessions (new):');
      console.log(`  • Total rows: ${sessionsCount[0].count}`);
      console.log('');
    }

    // Determine if migration is needed
    const hasOldData = (
      (tableNames.includes('workshop_students') &&
       (await sql`SELECT COUNT(*) as count FROM workshop_students`)[0].count > 0) ||
      (tableNames.includes('student_configs') &&
       (await sql`SELECT COUNT(*) as count FROM student_configs`)[0].count > 0)
    );

    const hasNewData = (
      (tableNames.includes('students') &&
       (await sql`SELECT COUNT(*) as count FROM students`)[0].count > 0) ||
      (tableNames.includes('sessions') &&
       (await sql`SELECT COUNT(*) as count FROM sessions`)[0].count > 0)
    );

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (hasOldData && !hasNewData) {
      console.log('✅ MIGRATION NEEDED');
      console.log('   Old tables have data, new tables are empty');
      console.log('   Run: node run-migration-local.js');
    } else if (hasNewData) {
      console.log('✅ MIGRATION COMPLETE');
      console.log('   New tables have data');
    } else {
      console.log('⚠️  NO DATA FOUND');
      console.log('   Both old and new tables are empty');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await sql.end();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nNote: If you get connection errors, the database might be');
    console.error('only accessible from Vercel. Run the migration via API instead.\n');
    await sql.end();
    process.exit(1);
  }
}

checkOldTables();
