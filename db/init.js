// Initialize Vercel Postgres database for Twilio Voice AI Workshop
// Run this once to set up your database schema

import { sql } from '@vercel/postgres';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initializeDatabase() {
  console.log('🔧 Initializing Vercel Postgres database...');

  try {
    // Read schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Split by semicolons to execute each statement separately
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📝 Executing ${statements.length} SQL statements...`);

    for (const statement of statements) {
      try {
        await sql.query(statement);
        console.log(`✅ Executed: ${statement.substring(0, 50)}...`);
      } catch (error) {
        // Some statements might fail if objects already exist (that's okay)
        if (error.message.includes('already exists')) {
          console.log(`⚠️  Skipped (already exists): ${statement.substring(0, 50)}...`);
        } else {
          console.error(`❌ Failed: ${statement.substring(0, 50)}...`);
          console.error(`   Error: ${error.message}`);
        }
      }
    }

    console.log('\n✅ Database initialization complete!');
    console.log('\nCreated tables:');
    console.log('  - workshop_sessions (replaces Twilio Sync)');
    console.log('  - workshop_students');
    console.log('  - workshop_step_progress');
    console.log('  - workshop_invitations');
    console.log('  - workshop_events');
    console.log('\nCreated views:');
    console.log('  - active_students');
    console.log('  - workshop_analytics');
    console.log('\nCreated functions:');
    console.log('  - cleanup_expired_sessions()');
    console.log('  - update_student_progress()');

  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  initializeDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { initializeDatabase };
