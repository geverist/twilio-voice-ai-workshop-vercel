#!/usr/bin/env node

/**
 * Cleanup old GitHub repositories created during workshop
 *
 * This script deletes workshop repositories to clean up your GitHub account.
 *
 * Usage:
 *   node cleanup-repos.js
 *   node cleanup-repos.js --dry-run  # See what would be deleted
 *   node cleanup-repos.js --keep 3   # Keep newest 3 repos
 */

import 'dotenv/config';

// Parse command line arguments first (before checking credentials)
const args = process.argv.slice(2);

// Show help
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
GitHub Workshop Repository Cleanup Tool

Usage:
  node cleanup-repos.js              Delete all workshop repos
  node cleanup-repos.js --dry-run    Preview what would be deleted
  node cleanup-repos.js --keep 3     Keep newest 3 repos, delete rest

  GITHUB_TOKEN=ghp_xxx node cleanup-repos.js --dry-run

Options:
  --dry-run        Show what would be deleted without actually deleting
  --keep N         Keep the N newest repos
  --help, -h       Show this help message

Environment Variables:
  GITHUB_TOKEN         Your GitHub Personal Access Token (required)
                       Must have 'delete_repo' scope

  Get a token at: https://github.com/settings/tokens
  Required scopes: repo, delete_repo
`);
  process.exit(0);
}

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_TOKEN) {
  console.error('❌ Missing GITHUB_TOKEN');
  console.error('');
  console.error('Get a token at: https://github.com/settings/tokens');
  console.error('Required scopes: repo, delete_repo');
  console.error('');
  console.error('Then run:');
  console.error('  GITHUB_TOKEN=ghp_xxx node cleanup-repos.js --dry-run');
  console.error('');
  console.error('Run "node cleanup-repos.js --help" for more info');
  process.exit(1);
}

const isDryRun = args.includes('--dry-run');
const keepCount = args.includes('--keep')
  ? parseInt(args[args.indexOf('--keep') + 1]) || 0
  : 0;

async function cleanupRepos() {
  console.log('🔍 Fetching your repositories...\n');

  try {
    // Get authenticated user
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Workshop-Cleanup-Script'
      }
    });

    if (!userResponse.ok) {
      throw new Error('Failed to authenticate with GitHub. Check your token.');
    }

    const user = await userResponse.json();
    console.log(`📝 Authenticated as: ${user.login}\n`);

    // List all repositories
    const reposResponse = await fetch(`https://api.github.com/users/${user.login}/repos?per_page=100&sort=updated`, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Workshop-Cleanup-Script'
      }
    });

    if (!reposResponse.ok) {
      throw new Error('Failed to fetch repositories');
    }

    const allRepos = await reposResponse.json();

    // Filter for workshop-related repos
    const TEMPLATE_DESCRIPTION = 'My AI-powered voice assistant built with Twilio ConversationRelay';

    const workshopRepos = allRepos.filter(repo => {
      const name = repo.name.toLowerCase();
      const description = (repo.description || '').toLowerCase();

      // Don't include the original template itself
      if (name === 'conversationrelay-starter-pack') {
        return false;
      }

      // Match workshop repos
      if (description === TEMPLATE_DESCRIPTION.toLowerCase()) {
        return true;
      }

      if (name.startsWith('ws-') && name.includes('voice-ai')) {
        return true;
      }

      if (name.includes('conversationrelay') || name.includes('voice-ai-workshop')) {
        return true;
      }

      return false;
    });

    if (workshopRepos.length === 0) {
      console.log('✅ No workshop repositories found!');
      return;
    }

    // Sort by date created (oldest first)
    workshopRepos.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    console.log(`📊 Found ${workshopRepos.length} workshop-related repositories\n`);

    // Determine which to delete
    const toDelete = keepCount > 0
      ? workshopRepos.slice(0, -keepCount)
      : workshopRepos;

    if (toDelete.length === 0) {
      console.log(`✅ No repos to delete (keeping newest ${keepCount})`);
      return;
    }

    console.log(`🗑️  Repositories to delete: ${toDelete.length}\n`);

    for (const repo of toDelete) {
      const age = Math.floor((Date.now() - new Date(repo.created_at)) / (1000 * 60 * 60 * 24));
      console.log(`  • ${repo.name}`);
      console.log(`    URL: ${repo.html_url}`);
      console.log(`    Created: ${repo.created_at} (${age} days ago)`);
      console.log(`    Private: ${repo.private ? 'Yes' : 'No'}`);

      if (!isDryRun) {
        try {
          const deleteResponse = await fetch(`https://api.github.com/repos/${repo.full_name}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `token ${GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'Workshop-Cleanup-Script'
            }
          });

          if (deleteResponse.ok || deleteResponse.status === 204) {
            console.log(`    ✅ Deleted\n`);
          } else {
            const errorText = await deleteResponse.text();
            console.log(`    ❌ Failed: ${deleteResponse.status} ${errorText}\n`);
          }
        } catch (error) {
          console.log(`    ❌ Failed: ${error.message}\n`);
        }

        // Rate limit: wait 1 second between deletions
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        console.log(`    🔍 [DRY RUN - would delete]\n`);
      }
    }

    if (keepCount > 0) {
      console.log(`\n✅ Kept newest ${keepCount} repositories:`);
      const kept = workshopRepos.slice(-keepCount);
      for (const repo of kept) {
        console.log(`  • ${repo.name} (${repo.html_url})`);
      }
    }

    if (isDryRun) {
      console.log('\n💡 This was a dry run. Re-run without --dry-run to actually delete.');
    } else {
      console.log(`\n✅ Cleanup complete!`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

console.log('🧹 GitHub Workshop Repository Cleanup\n');
if (isDryRun) {
  console.log('🔍 DRY RUN MODE - No repos will be deleted\n');
}
if (keepCount > 0) {
  console.log(`📌 Will keep newest ${keepCount} repositories\n`);
}

cleanupRepos();
