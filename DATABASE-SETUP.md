# Database Setup Guide - Vercel Postgres

This guide explains how to set up the Vercel Postgres database for the workshop instructor dashboard.

## Overview

The instructor dashboard uses **Vercel Postgres** to store:
- Student progress tracking
- Workshop invitation history
- Analytics and metrics

## Required Environment Variables

Add these to your Vercel project (Settings → Environment Variables):

```bash
# Vercel Postgres (automatically set when you create a database)
POSTGRES_URL="postgres://..."
POSTGRES_PRISMA_URL="postgres://..."
POSTGRES_URL_NON_POOLING="postgres://..."
POSTGRES_USER="..."
POSTGRES_HOST="..."
POSTGRES_PASSWORD="..."
POSTGRES_DATABASE="..."

# SendGrid for workshop invitations
SENDGRID_API_KEY="SG...."
INSTRUCTOR_EMAIL="your-email@example.com"
INSTRUCTOR_NAME="Your Name"
WORKSHOP_URL="https://your-app.vercel.app"
GITHUB_REPO_URL="https://github.com/yourusername/your-repo"
```

## Create Vercel Postgres Database

### Option 1: Via Vercel Dashboard (Recommended)

1. Go to your Vercel project dashboard
2. Click **Storage** tab
3. Click **Create Database**
4. Select **Postgres**
5. Choose a region close to your primary users
6. Click **Create**
7. Vercel automatically adds all environment variables

### Option 2: Via Vercel CLI

```bash
vercel env add POSTGRES_URL
# Follow prompts to create database
```

## Database Schema

Once your database is created, run these SQL commands to create the required tables.

### 1. Connect to Your Database

**Via Vercel Dashboard:**
- Go to Storage → Your Database → Query tab
- Paste the SQL below and click "Run"

**Via psql CLI:**
```bash
psql "your-postgres-url-here"
```

### 2. Create Tables

```sql
-- Student progress tracking table
CREATE TABLE IF NOT EXISTS workshop_students (
  id SERIAL PRIMARY KEY,
  student_email VARCHAR(255) NOT NULL UNIQUE,
  student_name VARCHAR(255),
  exercises JSONB DEFAULT '{}',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  total_time_spent INTEGER DEFAULT 0,
  completion_rate INTEGER DEFAULT 0,
  repo_created BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Workshop invitations table
CREATE TABLE IF NOT EXISTS workshop_invitations (
  id SERIAL PRIMARY KEY,
  student_email VARCHAR(255) NOT NULL,
  student_name VARCHAR(255),
  workshop_date VARCHAR(100),
  additional_notes TEXT,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_students_email ON workshop_students(student_email);
CREATE INDEX IF NOT EXISTS idx_students_last_activity ON workshop_students(last_activity DESC);
CREATE INDEX IF NOT EXISTS idx_students_completion ON workshop_students(completion_rate DESC);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON workshop_invitations(student_email);
CREATE INDEX IF NOT EXISTS idx_invitations_sent ON workshop_invitations(sent_at DESC);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_workshop_students_updated_at
  BEFORE UPDATE ON workshop_students
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### 3. Verify Tables Created

```sql
-- List all tables
\dt

-- Check workshop_students structure
\d workshop_students

-- Check workshop_invitations structure
\d workshop_invitations

-- Verify empty tables
SELECT COUNT(*) FROM workshop_students;
SELECT COUNT(*) FROM workshop_invitations;
```

## Testing the Setup

### Test Student Progress API

```bash
# Test creating student progress
curl -X POST https://your-app.vercel.app/api/track-student-progress \
  -H "Content-Type: application/json" \
  -d '{
    "studentId": "test@example.com",
    "studentName": "Test Student",
    "exerciseId": "exercise-1",
    "completed": true,
    "timeSpent": 300,
    "totalExercises": 9
  }'

# Test retrieving all students (for dashboard)
curl https://your-app.vercel.app/api/track-student-progress?getAllStudents=true
```

### Test Workshop Invitation API

```bash
# Test sending invitation
curl -X POST https://your-app.vercel.app/api/send-workshop-invitation \
  -H "Content-Type: application/json" \
  -d '{
    "studentEmail": "student@example.com",
    "studentName": "John Doe",
    "workshopDate": "January 20, 2025 at 10:00 AM PST",
    "additionalNotes": "Please bring your laptop!"
  }'
```

## Database Schema Details

### `workshop_students` Table

Stores student progress through the workshop exercises.

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `student_email` | VARCHAR(255) | Student email (unique) |
| `student_name` | VARCHAR(255) | Student name |
| `exercises` | JSONB | Exercise completion data |
| `started_at` | TIMESTAMP | When student started workshop |
| `last_activity` | TIMESTAMP | Last activity timestamp |
| `total_time_spent` | INTEGER | Total time in seconds |
| `completion_rate` | INTEGER | Percentage (0-100) |
| `repo_created` | BOOLEAN | Whether final repo was created |
| `created_at` | TIMESTAMP | Record creation time |
| `updated_at` | TIMESTAMP | Last update time |

**Example `exercises` JSONB:**
```json
{
  "exercise-1": {
    "completed": true,
    "timestamp": "2025-01-15T10:30:00Z",
    "timeSpent": 120,
    "attempts": 1,
    "lastAttempt": "2025-01-15T10:30:00Z"
  },
  "exercise-2": {
    "completed": false,
    "attempts": 3,
    "lastAttempt": "2025-01-15T11:00:00Z"
  }
}
```

### `workshop_invitations` Table

Logs all workshop invitations sent to students.

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `student_email` | VARCHAR(255) | Student email |
| `student_name` | VARCHAR(255) | Student name |
| `workshop_date` | VARCHAR(100) | Workshop date/time |
| `additional_notes` | TEXT | Custom notes for invitation |
| `sent_at` | TIMESTAMP | When invitation was sent |
| `created_at` | TIMESTAMP | Record creation time |

## Querying Student Data

### Get All Active Students

```sql
SELECT
  student_email,
  student_name,
  completion_rate,
  last_activity,
  repo_created
FROM workshop_students
WHERE last_activity > NOW() - INTERVAL '7 days'
ORDER BY last_activity DESC;
```

### Get Students Who Completed Workshop

```sql
SELECT
  student_email,
  student_name,
  completion_rate,
  total_time_spent / 60 as time_minutes,
  repo_created
FROM workshop_students
WHERE completion_rate = 100
ORDER BY created_at DESC;
```

### Get Exercise Completion Stats

```sql
SELECT
  AVG(completion_rate) as avg_completion,
  COUNT(*) as total_students,
  SUM(CASE WHEN repo_created THEN 1 ELSE 0 END) as repos_created,
  AVG(total_time_spent / 60) as avg_time_minutes
FROM workshop_students;
```

### Get Recent Invitations

```sql
SELECT
  student_email,
  student_name,
  workshop_date,
  sent_at
FROM workshop_invitations
WHERE sent_at > NOW() - INTERVAL '30 days'
ORDER BY sent_at DESC;
```

## Scaling Considerations

### For High Volume Workshops

If you expect **hundreds of students** in a single workshop:

1. **Enable Connection Pooling** (Vercel Postgres has this built-in)
2. **Add Caching** - Cache the instructor dashboard API response:
   ```javascript
   res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate');
   ```
3. **Pagination** - Modify API to support pagination:
   ```sql
   SELECT * FROM workshop_students
   ORDER BY last_activity DESC
   LIMIT 50 OFFSET 0;
   ```

### For Multiple Workshops

Add a `workshop_id` column to separate cohorts:

```sql
ALTER TABLE workshop_students
ADD COLUMN workshop_id VARCHAR(50) DEFAULT 'default';

CREATE INDEX idx_students_workshop ON workshop_students(workshop_id);
```

## Backup and Export

### Export Student Data (CSV)

```sql
COPY (
  SELECT
    student_email,
    student_name,
    completion_rate,
    total_time_spent / 60 as time_minutes,
    repo_created,
    last_activity
  FROM workshop_students
  ORDER BY last_activity DESC
) TO STDOUT WITH CSV HEADER;
```

### Backup Database

Vercel Postgres includes automatic daily backups. For manual backups:

```bash
pg_dump your-postgres-url > workshop_backup.sql
```

## Troubleshooting

### "Database not configured" error

**Problem:** API returns "Database not configured"

**Solution:**
1. Verify `POSTGRES_URL` is set in Vercel environment variables
2. Redeploy your app: `vercel --prod`
3. Check Vercel deployment logs for errors

### "relation does not exist" error

**Problem:** SQL queries fail with relation/table errors

**Solution:**
1. Run the CREATE TABLE statements again
2. Verify you're connected to the correct database
3. Check the Query tab in Vercel dashboard shows your tables

### Slow query performance

**Problem:** Dashboard loads slowly with many students

**Solution:**
1. Verify indexes are created (run the CREATE INDEX statements)
2. Add caching to API responses (see scaling section)
3. Consider adding pagination for 100+ students

### SendGrid email not sending

**Problem:** Invitations don't send

**Solution:**
1. Verify `SENDGRID_API_KEY` is set correctly
2. Check SendGrid API key has "Mail Send" permission
3. Verify sender email is authenticated in SendGrid
4. Check Vercel function logs for errors

## Next Steps

1. ✅ Create Vercel Postgres database
2. ✅ Run schema SQL to create tables
3. ✅ Set environment variables
4. ✅ Test API endpoints
5. ✅ Open instructor dashboard: `https://your-app.vercel.app/instructor-dashboard.html`

## Support

For issues with:
- **Vercel Postgres**: https://vercel.com/docs/storage/vercel-postgres
- **SendGrid**: https://docs.sendgrid.com/
- **Workshop Code**: Check GitHub repository issues
