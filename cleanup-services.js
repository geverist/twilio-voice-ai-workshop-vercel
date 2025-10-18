#!/usr/bin/env node

/**
 * Cleanup old Twilio Serverless services created during workshop
 *
 * This script deletes services that match workshop patterns to stay under
 * the 50 service limit.
 *
 * Usage:
 *   node cleanup-services.js
 *   node cleanup-services.js --dry-run  # See what would be deleted
 *   node cleanup-services.js --keep 5   # Keep newest 5 services
 */

import 'dotenv/config';
import twilio from 'twilio';

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

if (!ACCOUNT_SID || !AUTH_TOKEN) {
  console.error('❌ Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN in .env');
  process.exit(1);
}

const client = twilio(ACCOUNT_SID, AUTH_TOKEN);

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const keepCount = args.includes('--keep')
  ? parseInt(args[args.indexOf('--keep') + 1]) || 0
  : 0;

async function cleanupServices() {
  console.log('🔍 Fetching all Serverless services...\n');

  try {
    // Get all services
    const services = await client.serverless.v1.services.list();

    // Filter for workshop-related services (services with 'workshop', 'step', or 'student' in name)
    const workshopServices = services.filter(service => {
      const name = service.friendlyName.toLowerCase();
      return name.includes('workshop') ||
             name.includes('step') ||
             name.includes('student') ||
             name.includes('voice-ai');
    });

    if (workshopServices.length === 0) {
      console.log('✅ No workshop services found!');
      return;
    }

    // Sort by date created (oldest first)
    workshopServices.sort((a, b) => new Date(a.dateCreated) - new Date(b.dateCreated));

    console.log(`📊 Found ${workshopServices.length} workshop-related services`);
    console.log(`📊 Total services in account: ${services.length}/50\n`);

    // Determine which to delete
    const toDelete = keepCount > 0
      ? workshopServices.slice(0, -keepCount)
      : workshopServices;

    if (toDelete.length === 0) {
      console.log(`✅ No services to delete (keeping newest ${keepCount})`);
      return;
    }

    console.log(`🗑️  Services to delete: ${toDelete.length}\n`);

    for (const service of toDelete) {
      const age = Math.floor((Date.now() - new Date(service.dateCreated)) / (1000 * 60 * 60 * 24));
      console.log(`  • ${service.friendlyName}`);
      console.log(`    SID: ${service.sid}`);
      console.log(`    Created: ${service.dateCreated} (${age} days ago)`);

      if (!isDryRun) {
        try {
          await client.serverless.v1.services(service.sid).remove();
          console.log(`    ✅ Deleted\n`);
        } catch (error) {
          console.log(`    ❌ Failed: ${error.message}\n`);
        }
      } else {
        console.log(`    🔍 [DRY RUN - would delete]\n`);
      }
    }

    if (keepCount > 0) {
      console.log(`\n✅ Kept newest ${keepCount} services:`);
      const kept = workshopServices.slice(-keepCount);
      for (const service of kept) {
        console.log(`  • ${service.friendlyName} (${service.sid})`);
      }
    }

    if (isDryRun) {
      console.log('\n💡 This was a dry run. Re-run without --dry-run to actually delete.');
    } else {
      const remaining = services.length - toDelete.length;
      console.log(`\n✅ Cleanup complete! Services remaining: ${remaining}/50`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Show help
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Twilio Workshop Service Cleanup Tool

Usage:
  node cleanup-services.js              Delete all workshop services
  node cleanup-services.js --dry-run    Preview what would be deleted
  node cleanup-services.js --keep 5     Keep newest 5 services, delete rest

Options:
  --dry-run        Show what would be deleted without actually deleting
  --keep N         Keep the N newest services
  --help, -h       Show this help message

Environment Variables (in .env):
  TWILIO_ACCOUNT_SID    Your Twilio Account SID
  TWILIO_AUTH_TOKEN     Your Twilio Auth Token
`);
  process.exit(0);
}

console.log('🧹 Twilio Workshop Service Cleanup\n');
if (isDryRun) {
  console.log('🔍 DRY RUN MODE - No services will be deleted\n');
}
if (keepCount > 0) {
  console.log(`📌 Will keep newest ${keepCount} services\n`);
}

cleanupServices();
