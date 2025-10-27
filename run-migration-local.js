#!/usr/bin/env node

/**
 * Local Migration Script
 *
 * Runs the database migration directly without needing deployed API endpoints.
 * Usage: node run-migration-local.js
 */

import postgres from 'postgres';

const POSTGRES_URL = process.env.POSTGRES_URL || 'postgres://107e2d7c20df9f4d880bc758127a4c81ae6335cde27a21a8ca5c0f886414356e:sk_HiqJU4IYIfGyDbStEMhmd@db.prisma.io:5432/postgres?sslmode=require';

const sql = postgres(POSTGRES_URL, {
  ssl: 'require',
  max: 1
});

console.log('🚀 Starting Database Migration...\n');

async function runMigration() {
  try {
    // Step 1: Create unified schema
    console.log('📝 Step 1: Creating unified schema...');

    await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
    console.log('  ✅ UUID extension enabled');

    // Create students table
    await sql`
      CREATE TABLE IF NOT EXISTS students (
        student_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        student_email TEXT UNIQUE NOT NULL,
        student_name TEXT,
        github_username TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    console.log('  ✅ Created students table');

    await sql`CREATE INDEX IF NOT EXISTS idx_students_email ON students(student_email)`;
    console.log('  ✅ Added index on students.student_email');

    // Create sessions table
    await sql`
      CREATE TABLE IF NOT EXISTS sessions (
        session_token TEXT PRIMARY KEY,
        student_id UUID NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
        started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '30 days',
        is_active BOOLEAN DEFAULT TRUE,
        demo_mode BOOLEAN DEFAULT FALSE,
        use_case_description TEXT,
        call_direction TEXT,
        selected_phone_number TEXT,
        tts_provider TEXT,
        selected_voice TEXT,
        openai_api_key TEXT,
        system_prompt TEXT,
        ivr_greeting TEXT,
        tools JSONB DEFAULT '[]',
        voice_settings JSONB DEFAULT '{}',
        websocket_url TEXT,
        codespace_url TEXT,
        github_repo_url TEXT,
        railway_url TEXT,
        current_step INTEGER DEFAULT 0,
        total_time_spent INTEGER DEFAULT 0,
        completion_rate INTEGER DEFAULT 0,
        twilio_connected BOOLEAN DEFAULT FALSE,
        openai_connected BOOLEAN DEFAULT FALSE,
        call_direction_chosen BOOLEAN DEFAULT FALSE,
        services_ready BOOLEAN DEFAULT FALSE,
        step4_code_validated BOOLEAN DEFAULT FALSE,
        step4_committed BOOLEAN DEFAULT FALSE,
        step4_deployed BOOLEAN DEFAULT FALSE,
        step5_code_validated BOOLEAN DEFAULT FALSE,
        step5_committed BOOLEAN DEFAULT FALSE,
        step5_deployed BOOLEAN DEFAULT FALSE,
        step6_code_validated BOOLEAN DEFAULT FALSE,
        step6_committed BOOLEAN DEFAULT FALSE,
        step6_deployed BOOLEAN DEFAULT FALSE,
        system_prompt_saved BOOLEAN DEFAULT FALSE,
        step7_committed BOOLEAN DEFAULT FALSE,
        step7_deployed BOOLEAN DEFAULT FALSE,
        tools_configured BOOLEAN DEFAULT FALSE,
        step8_code_validated BOOLEAN DEFAULT FALSE,
        step8_committed BOOLEAN DEFAULT FALSE,
        step8_deployed BOOLEAN DEFAULT FALSE,
        project_deployed BOOLEAN DEFAULT FALSE,
        exercises JSONB DEFAULT '{}',
        bug_reports JSONB DEFAULT '[]',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    console.log('  ✅ Created sessions table');

    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_student ON sessions(student_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_activity ON sessions(last_activity DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active, expires_at)`;
    console.log('  ✅ Added indexes on sessions table');

    console.log('\n✅ Step 1 Complete: Unified schema created!\n');

    // Step 2: Migrate data
    console.log('📝 Step 2: Migrating data from old tables...');

    // Check which tables exist
    const tableCheck = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('workshop_students', 'student_configs')
    `;

    const existingTables = tableCheck.map(t => t.table_name);
    console.log(`  📊 Found tables: ${existingTables.join(', ')}`);

    // Extract unique students
    const uniqueStudents = new Map();

    if (existingTables.includes('workshop_students')) {
      const wsStudents = await sql`
        SELECT DISTINCT ON (student_email)
          student_email,
          student_name,
          created_at
        FROM workshop_students
        WHERE student_email IS NOT NULL
        ORDER BY student_email, created_at ASC
      `;

      wsStudents.forEach(s => {
        uniqueStudents.set(s.student_email, {
          email: s.student_email,
          name: s.student_name,
          created_at: s.created_at
        });
      });

      console.log(`  ✅ Found ${wsStudents.length} students in workshop_students`);
    }

    if (existingTables.includes('student_configs')) {
      const scStudents = await sql`
        SELECT DISTINCT ON (student_email)
          student_email,
          student_name,
          created_at
        FROM student_configs
        WHERE student_email IS NOT NULL
        ORDER BY student_email, created_at ASC
      `;

      scStudents.forEach(s => {
        if (!uniqueStudents.has(s.student_email)) {
          uniqueStudents.set(s.student_email, {
            email: s.student_email,
            name: s.student_name,
            created_at: s.created_at
          });
        }
      });

      console.log(`  ✅ Found ${scStudents.length} students in student_configs`);
    }

    console.log(`  📊 Total unique students: ${uniqueStudents.size}`);

    // Create student records
    const studentIdMap = new Map();
    let studentsCreated = 0;

    for (const [email, studentData] of uniqueStudents) {
      try {
        const existing = await sql`
          SELECT student_id FROM students WHERE student_email = ${email}
        `;

        if (existing.length > 0) {
          studentIdMap.set(email, existing[0].student_id);
          continue;
        }

        const inserted = await sql`
          INSERT INTO students (student_email, student_name, created_at)
          VALUES (${email}, ${studentData.name}, ${studentData.created_at})
          RETURNING student_id
        `;

        studentIdMap.set(email, inserted[0].student_id);
        studentsCreated++;
      } catch (error) {
        console.error(`  ⚠️  Failed to create student ${email}:`, error.message);
      }
    }

    console.log(`  ✅ Created ${studentsCreated} new student records`);

    // Migrate sessions from workshop_students
    let wsMigrated = 0;

    if (existingTables.includes('workshop_students')) {
      const wsSessions = await sql`
        SELECT * FROM workshop_students WHERE session_token IS NOT NULL
      `;

      for (const session of wsSessions) {
        try {
          const studentId = studentIdMap.get(session.student_email);
          if (!studentId) continue;

          const existing = await sql`
            SELECT session_token FROM sessions WHERE session_token = ${session.session_token}
          `;

          if (existing.length > 0) continue;

          await sql`
            INSERT INTO sessions (
              session_token, student_id, started_at, last_activity, demo_mode,
              selected_phone_number, selected_voice, tts_provider,
              openai_api_key, system_prompt, tools, exercises,
              current_step, total_time_spent, completion_rate,
              created_at, updated_at
            ) VALUES (
              ${session.session_token}, ${studentId},
              ${session.started_at || session.created_at},
              ${session.last_activity || session.updated_at},
              ${session.demo_mode || false},
              ${session.selected_phone_number}, ${session.selected_voice}, ${session.tts_provider},
              ${session.openai_api_key}, ${session.system_prompt},
              ${session.tools || '[]'}, ${session.exercises || '{}'},
              ${session.current_step || 0}, ${session.total_time_spent || 0},
              ${session.completion_rate || 0},
              ${session.created_at}, ${session.updated_at}
            )
          `;

          wsMigrated++;
        } catch (error) {
          console.error(`  ⚠️  Failed to migrate session ${session.session_token}:`, error.message);
        }
      }

      console.log(`  ✅ Migrated ${wsMigrated} sessions from workshop_students`);
    }

    console.log('\n✅ Step 2 Complete: Data migrated successfully!\n');

    // Summary
    console.log('📊 Migration Summary:');
    console.log(`  • Students: ${uniqueStudents.size} unique (${studentsCreated} new)`);
    console.log(`  • Sessions: ${wsMigrated} migrated`);
    console.log('\n🎉 Migration completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('  1. Verify data in instructor dashboard');
    console.log('  2. Test API endpoints');
    console.log('  3. Once verified, run cleanup script to rename old tables\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

runMigration();
