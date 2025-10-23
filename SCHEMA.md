# Database Schema Documentation

## Normalized Schema V2 (Recommended)

This is the properly normalized schema using UUIDs for student identification.

### Tables

#### 1. `students` - Student Master Records
One record per unique student.

```sql
CREATE TABLE students (
  student_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_email TEXT UNIQUE NOT NULL,
  student_name TEXT,
  twilio_account_sid TEXT,
  github_username TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Primary Key**: `student_id` (UUID)
**Unique Constraints**: `student_email`
**Indexes**: `student_email`

**Benefits**:
- Students can change their email address
- UUID provides globally unique identifier
- Fast lookups via indexed email
- Immutable student identity

---

#### 2. `sessions` - Workshop Sessions
One record per workshop session. Students can have multiple sessions.

```sql
CREATE TABLE sessions (
  session_token TEXT PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,

  -- Session metadata
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '24 hours',
  is_active BOOLEAN DEFAULT TRUE,
  demo_mode BOOLEAN DEFAULT FALSE,

  -- Overall progress
  current_step INTEGER DEFAULT 0,
  total_time_spent INTEGER DEFAULT 0,
  completion_rate INTEGER DEFAULT 0,

  -- Workshop configuration
  use_case_description TEXT,
  call_direction TEXT,
  selected_phone_number TEXT,
  tts_provider TEXT,
  selected_voice TEXT,

  -- AI configuration
  openai_api_key TEXT,
  system_prompt TEXT,
  ivr_greeting TEXT,
  tools JSONB DEFAULT '[]',
  voice_settings JSONB DEFAULT '{}',

  -- Deployment URLs
  websocket_url TEXT,
  codespace_url TEXT,
  github_repo_url TEXT,
  railway_url TEXT,

  -- Bug tracking
  bug_reports JSONB DEFAULT '[]',

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Primary Key**: `session_token`
**Foreign Keys**: `student_id` -> `students.student_id` (CASCADE DELETE)
**Indexes**: `student_id`, `last_activity`, `is_active + expires_at`

**Relationships**:
- One student → Many sessions (1:N)
- Deleting a student deletes all their sessions

---

#### 3. `step_progress` - Individual Step Tracking
Granular tracking of each step's completion status per session.

```sql
CREATE TABLE step_progress (
  id SERIAL PRIMARY KEY,
  session_token TEXT NOT NULL REFERENCES sessions(session_token) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,

  -- Step identification
  step_number INTEGER NOT NULL,
  step_name TEXT NOT NULL,

  -- Progress tracking
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  time_spent INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  validation_passed BOOLEAN DEFAULT FALSE,

  -- Code/work submitted
  code_submitted TEXT,
  deployment_url TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(session_token, step_number)
);
```

**Primary Key**: `id` (SERIAL)
**Foreign Keys**:
- `session_token` -> `sessions.session_token` (CASCADE DELETE)
- `student_id` -> `students.student_id` (CASCADE DELETE)

**Unique Constraints**: `(session_token, step_number)` - One progress record per step per session
**Indexes**: `session_token`, `student_id`

**Relationships**:
- One session → Many step progress records (1:N)
- Deleting a session deletes all its step progress

---

#### 4. `events` - Audit Trail
Event log for analytics and debugging.

```sql
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  student_id UUID REFERENCES students(student_id) ON DELETE CASCADE,
  session_token TEXT REFERENCES sessions(session_token) ON DELETE CASCADE,

  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}',

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Primary Key**: `id` (SERIAL)
**Foreign Keys**:
- `student_id` -> `students.student_id` (CASCADE DELETE)
- `session_token` -> `sessions.session_token` (CASCADE DELETE)

**Indexes**: `student_id`, `session_token`

**Event Types**:
- `session_created`
- `step_started`
- `step_completed`
- `step_progress`
- `deployment_success`
- `deployment_failure`
- `bug_reported`

---

## Entity Relationship Diagram

```
┌──────────────┐
│   students   │
│──────────────│
│ student_id   │◄─────────┐
│ email        │          │
│ name         │          │
│ github_user  │          │
└──────────────┘          │
                          │ 1:N
                          │
                    ┌─────┴────────┐
                    │   sessions   │
                    │──────────────│
                    │ session_token│◄──────────┐
                    │ student_id   │           │
                    │ current_step │           │
                    │ completion % │           │ 1:N
                    │ config...    │           │
                    └──────────────┘           │
                          │                    │
                          │ 1:N          ┌─────┴──────────┐
                          │              │ step_progress  │
                          │              │────────────────│
                          │              │ session_token  │
                          ▼              │ student_id     │
                    ┌──────────────┐    │ step_number    │
                    │    events    │    │ completed_at   │
                    │──────────────│    │ time_spent     │
                    │ session_token│    │ attempts       │
                    │ student_id   │    │ validation     │
                    │ event_type   │    └────────────────┘
                    │ event_data   │
                    └──────────────┘
```

---

## Helper Functions

### `update_session_progress(session_token)`
Automatically recalculates session completion percentage and total time.

```sql
CREATE OR REPLACE FUNCTION update_session_progress(p_session_token TEXT)
RETURNS VOID AS $$
DECLARE
  total_steps INTEGER := 9;
  completed_steps INTEGER;
  total_time INTEGER;
BEGIN
  -- Count completed steps
  SELECT COUNT(*), COALESCE(SUM(time_spent), 0)
  INTO completed_steps, total_time
  FROM step_progress
  WHERE session_token = p_session_token
    AND validation_passed = TRUE;

  -- Update session
  UPDATE sessions
  SET
    completion_rate = ROUND((completed_steps::NUMERIC / total_steps) * 100),
    total_time_spent = total_time,
    last_activity = NOW()
  WHERE session_token = p_session_token;
END;
$$ LANGUAGE plpgsql;
```

**Usage**:
```sql
SELECT update_session_progress('ws_1234567890_abc123');
```

---

## Migration Guide

### Running the Migration

1. **Backup existing data**:
```bash
# Export current data
curl -X GET "https://your-app.vercel.app/api/track-student-progress?getAllStudents=true" > backup.json
```

2. **Run normalization**:
```bash
curl -X POST "https://your-app.vercel.app/api/admin-normalize-database-v2" \
  -H "Content-Type: application/json" \
  -d '{"adminPassword": "YOUR_ADMIN_PASSWORD"}'
```

3. **Verify migration**:
```sql
SELECT COUNT(*) FROM students;
SELECT COUNT(*) FROM sessions;
SELECT COUNT(*) FROM step_progress;
```

### Data Migration Process

The migration automatically:
1. Creates new normalized tables
2. Migrates data from `workshop_students` table
3. Extracts unique students (by email)
4. Creates student records with UUIDs
5. Migrates sessions with foreign key relationships
6. Converts JSONB `exercises` field to `step_progress` records
7. Creates indexes for performance
8. Backs up old tables with timestamp suffix

---

## API Endpoints

### Student Progress API (`/api/student-progress`)

#### GET: Retrieve Progress

**By Session Token**:
```javascript
GET /api/student-progress?sessionToken=ws_123...

Response:
{
  "success": true,
  "progress": {
    "session_token": "ws_123...",
    "student_id": "uuid-here",
    "student_email": "student@example.com",
    "student_name": "John Doe",
    "current_step": 3,
    "completion_rate": 33,
    "step_progress": [
      {
        "stepNumber": 1,
        "stepName": "Setup",
        "completed": true,
        "timeSpent": 300,
        "attempts": 1
      },
      ...
    ]
  }
}
```

**By Student Email**:
```javascript
GET /api/student-progress?studentEmail=student@example.com

Response:
{
  "success": true,
  "sessions": [
    { /* session 1 */ },
    { /* session 2 */ }
  ]
}
```

**By Student ID**:
```javascript
GET /api/student-progress?studentId=uuid-here

Response:
{
  "success": true,
  "sessions": [...]
}
```

#### POST: Update Progress

```javascript
POST /api/student-progress
Content-Type: application/json

{
  "sessionToken": "ws_123...",
  "studentEmail": "student@example.com",
  "studentName": "John Doe",
  "stepNumber": 3,
  "stepName": "Services",
  "completed": true,
  "timeSpent": 450,
  "codeSubmitted": "...",
  "deploymentUrl": "https://..."
}

Response:
{
  "success": true,
  "message": "Progress updated successfully",
  "progress": { /* updated session */ }
}
```

---

## Query Examples

### Get all sessions for a student
```sql
SELECT s.*, st.student_email, st.student_name
FROM sessions s
JOIN students st ON s.student_id = st.student_id
WHERE st.student_email = 'student@example.com'
ORDER BY s.last_activity DESC;
```

### Get student completion summary
```sql
SELECT
  st.student_email,
  st.student_name,
  COUNT(DISTINCT s.session_token) as total_sessions,
  AVG(s.completion_rate) as avg_completion,
  MAX(s.last_activity) as last_active
FROM students st
LEFT JOIN sessions s ON st.student_id = s.student_id
GROUP BY st.student_id, st.student_email, st.student_name;
```

### Get step completion funnel
```sql
SELECT
  step_number,
  step_name,
  COUNT(*) as attempts,
  SUM(CASE WHEN validation_passed THEN 1 ELSE 0 END) as completed,
  ROUND(AVG(time_spent)) as avg_time_seconds
FROM step_progress
GROUP BY step_number, step_name
ORDER BY step_number;
```

### Find stuck students (inactive for 24h on same step)
```sql
SELECT
  st.student_email,
  s.current_step,
  s.last_activity,
  NOW() - s.last_activity as time_inactive
FROM sessions s
JOIN students st ON s.student_id = st.student_id
WHERE
  s.is_active = TRUE
  AND s.last_activity < NOW() - INTERVAL '24 hours'
  AND s.completion_rate < 100
ORDER BY s.last_activity ASC;
```

---

## Performance Considerations

### Indexes
All critical lookup paths are indexed:
- `students.student_email` - Fast lookup by email
- `sessions.student_id` - Fast session retrieval for a student
- `sessions.last_activity` - Efficient sorting by activity
- `sessions.is_active + expires_at` - Quick active session filtering
- `step_progress.session_token` - Fast step lookup for session
- `step_progress.student_id` - Student-wide progress queries

### Triggers
- `updated_at` automatically maintained via triggers
- No manual timestamp management needed

### Cascade Deletes
- Deleting a student deletes all sessions and step progress
- Deleting a session deletes all step progress
- Maintains referential integrity automatically

---

## Security Notes

1. **Sensitive Data**:
   - `openai_api_key` stored in `sessions` table
   - Consider encrypting at application layer
   - Never expose in GET responses to clients

2. **Student Privacy**:
   - Use `student_id` (UUID) in URLs, not email
   - Email only for authentication/lookup
   - Share links use: `/workshop?student={student_id}`

3. **Session Expiration**:
   - `expires_at` defaults to 24 hours
   - Cleanup job should run daily to remove expired sessions
   - See `api/cleanup-sessions.js`

---

## Legacy Schema Compatibility

Old tables maintained for reference:
- `workshop_students` -> renamed to `workshop_students_backup_{timestamp}`
- `workshop_sessions` -> migrated data to new `sessions` table
- `student_configs` -> can coexist, separate use case

Migration script does NOT delete old tables, only renames them for safety.
