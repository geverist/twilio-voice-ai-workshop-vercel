# Vercel Postgres Setup for Voice AI Workshop

This project uses **Vercel Postgres** instead of Twilio Sync for reliable, scalable data storage.

## Why Postgres Instead of Twilio Sync?

- ✅ **More reliable** - Production-grade database with ACID guarantees
- ✅ **Better querying** - Complex analytics queries with SQL
- ✅ **Lower cost** - Pay for what you use, no per-sync-map charges
- ✅ **Easier debugging** - Standard SQL tools and queries
- ✅ **Built for scale** - Handles millions of rows with connection pooling

## Quick Setup

### 1. Create Vercel Postgres Database

```bash
# Install Vercel CLI if you haven't
npm i -g vercel

# Login to Vercel
vercel login

# Link your project
vercel link

# Create Postgres database
vercel storage create postgres workshop-db
```

This will:
- Create a new Postgres database
- Automatically add connection environment variables to your project:
  - `POSTGRES_URL`
  - `POSTGRES_PRISMA_URL`
  - `POSTGRES_URL_NON_POOLING`
  - `POSTGRES_USER`
  - `POSTGRES_HOST`
  - `POSTGRES_PASSWORD`
  - `POSTGRES_DATABASE`

### 2. Initialize Database Schema

```bash
# Run the initialization script
node db/init.js
```

This creates:
- **Tables:** `workshop_sessions`, `workshop_students`, `workshop_step_progress`, `workshop_invitations`, `workshop_events`
- **Views:** `active_students`, `workshop_analytics`
- **Functions:** `cleanup_expired_sessions()`, `update_student_progress()`

### 3. Verify Setup

```bash
# Test database connection
vercel env pull .env.local
node -e "import('@vercel/postgres').then(m => m.sql\`SELECT NOW()\`.then(r => console.log('✅ Connected:', r.rows[0])))"
```

## Database Schema

### Tables

**workshop_sessions** (replaces Twilio Sync)
- Stores student authentication sessions
- Auto-expires after 24 hours
- Indexed for fast lookups

**workshop_students**
- Core student data and progress
- Tracks completion rates, deployments, time spent
- Indexed by email, activity, completion

**workshop_step_progress**
- Per-step tracking for each student
- Stores code submissions, validation errors, attempts
- Enables detailed analytics

**workshop_invitations**
- Email invitations sent to students
- Tracks delivery status and follow-ups
- Used by instructor dashboard

**workshop_events**
- Detailed event log for debugging
- JSONB data for flexible event storage
- Helps understand user behavior

### Views

**active_students**
- Students active in last 7 days
- Pre-calculated step completion counts
- Optimized for dashboard queries

**workshop_analytics**
- Summary statistics across all students
- Total/active/completed counts
- Average completion rates and time spent
- Deployment statistics

### Functions

**cleanup_expired_sessions()**
- Removes expired sessions automatically
- Can be called manually or via cron job

**update_student_progress(student_id)**
- Recalculates student's completion rate
- Updates time spent and current step
- Call after step completion

## API Endpoints

### `/api/track-student-progress`

Get all student progress (for instructor dashboard):
```bash
curl "https://your-app.vercel.app/api/track-student-progress?getAllStudents=true"
```

Returns:
```json
{
  "success": true,
  "students": [...],
  "summary": {
    "totalStudents": 150,
    "activeWeek": 45,
    "completedStudents": 23,
    "reposCreated": 67,
    "avgCompletionRate": 78.5
  },
  "stepStats": [...]
}
```

### `/api/send-workshop-invitation`

Send invitation to student:
```bash
curl -X POST "https://your-app.vercel.app/api/send-workshop-invitation" \
  -H "Content-Type: application/json" \
  -d '{
    "studentEmail": "student@example.com",
    "studentName": "Jane Doe",
    "workshopDate": "2025-01-20",
    "additionalNotes": "Please review the prerequisites before attending"
  }'
```

## Environment Variables

Add these to your Vercel project:

```bash
# Postgres (automatically added by `vercel storage create`)
POSTGRES_URL=postgres://...
POSTGRES_PRISMA_URL=...

# SendGrid (optional - for email invitations)
SENDGRID_API_KEY=SG.xxx
INSTRUCTOR_EMAIL=instructor@example.com
INSTRUCTOR_NAME=John Smith
WORKSHOP_URL=https://twilio-voice-ai-workshop-vercel.vercel.app
```

To add environment variables:
```bash
vercel env add SENDGRID_API_KEY
vercel env add INSTRUCTOR_EMAIL
vercel env add INSTRUCTOR_NAME
```

## Local Development

### Option 1: Use Vercel Dev (Recommended)

```bash
# Pull environment variables
vercel env pull .env.local

# Run dev server (connects to Vercel Postgres)
vercel dev
```

### Option 2: Local Postgres

```bash
# Install PostgreSQL locally
brew install postgresql@16
brew services start postgresql@16

# Create local database
createdb workshop_local

# Update .env.local
POSTGRES_URL=postgresql://localhost/workshop_local

# Initialize schema
node db/init.js

# Run dev server
npm run dev
```

## Migration from Twilio Sync

If you have existing data in Twilio Sync, here's how to migrate:

### 1. Export from Twilio Sync

```javascript
// scripts/export-sync-data.js
const twilio = require('twilio');
const fs = require('fs');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function exportSessions() {
  const syncService = await client.sync.v1.services(process.env.TWILIO_SYNC_SVC_SID);
  const documents = await syncService.documents.list();

  const sessions = [];
  for (const doc of documents) {
    const data = await syncService.documents(doc.sid).fetch();
    sessions.push(data.data);
  }

  fs.writeFileSync('sync-export.json', JSON.stringify(sessions, null, 2));
  console.log(`Exported ${sessions.length} sessions`);
}

exportSessions();
```

### 2. Import to Postgres

```javascript
// scripts/import-to-postgres.js
import { sql } from '@vercel/postgres';
import fs from 'fs';

const sessions = JSON.parse(fs.readFileSync('sync-export.json'));

for (const session of sessions) {
  await sql`
    INSERT INTO workshop_sessions (
      session_id, student_id, account_sid, auth_token, created_at, expires_at
    ) VALUES (
      ${session.sessionId},
      ${session.studentId},
      ${session.accountSid},
      ${session.authToken},
      ${new Date(session.createdAt)},
      ${new Date(Date.now() + 24 * 60 * 60 * 1000)}
    )
    ON CONFLICT (session_id) DO NOTHING
  `;
}

console.log('Import complete!');
```

## Maintenance

### Clean Up Expired Sessions

```bash
# Manually run cleanup
vercel env pull .env.local
node -e "import('@vercel/postgres').then(m => m.sql\`SELECT cleanup_expired_sessions()\`.then(r => console.log('Cleaned up', r.rows[0].cleanup_expired_sessions, 'sessions')))"
```

Or set up a cron job in `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cleanup-sessions",
    "schedule": "0 * * * *"
  }]
}
```

### Backup Database

```bash
# Backup to file
pg_dump $POSTGRES_URL > backup-$(date +%Y%m%d).sql

# Restore from backup
psql $POSTGRES_URL < backup-20250116.sql
```

### Monitor Performance

```sql
-- Check table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check slow queries
SELECT * FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;

-- Check active connections
SELECT * FROM pg_stat_activity;
```

## Troubleshooting

### "relation does not exist"

Your schema hasn't been initialized:
```bash
node db/init.js
```

### "too many connections"

Vercel Postgres uses connection pooling, but if you hit limits:
1. Use `POSTGRES_URL` (has built-in pooling)
2. Increase connection limit in Vercel dashboard
3. Check for connection leaks in your code

### "permission denied"

Make sure you're using the correct `POSTGRES_URL` from Vercel:
```bash
vercel env pull .env.local
cat .env.local | grep POSTGRES
```

### Data not showing in dashboard

1. Check if tables are populated:
```sql
SELECT COUNT(*) FROM workshop_students;
```

2. Check API endpoint:
```bash
curl "https://your-app.vercel.app/api/track-student-progress?getAllStudents=true"
```

3. Check browser console for errors

## Cost Estimation

Vercel Postgres pricing (as of 2025):
- **Free tier**: 256 MB storage, 60 hours compute/month
- **Pro tier**: $0.10/GB storage, $0.07/hour compute
- **Pooler**: Included free

Example costs for 100 students:
- Storage: ~50 MB (~$0.005/month)
- Compute: ~10 hours/month (~$0.70/month)
- **Total**: <$1/month

Compare to Twilio Sync:
- $0.03/1000 writes
- $0.01/1000 reads
- 100 students × 100 actions = 10,000 operations = $0.30-$0.50/month

Both are cheap, but Postgres is:
- More predictable cost
- Better for analytics
- More reliable long-term

## Support

- **Vercel Docs**: https://vercel.com/docs/storage/vercel-postgres
- **Postgres Docs**: https://www.postgresql.org/docs/
- **Vercel Support**: support@vercel.com
