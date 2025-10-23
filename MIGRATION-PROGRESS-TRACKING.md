# Progress Tracking Migration Guide

## Summary

This migration unifies two competing progress tracking systems into a single, normalized schema.

## Before Migration

### Old System 1: `track-student-progress.js`
- **Table**: `workshop_students`
- **Structure**: JSONB column `exercises` storing flat object
- **Status**: Currently in use by frontend (index.html:1660)
- **Issues**:
  - JSONB makes querying difficult
  - No normalized step tracking
  - Inconsistent with session management

### Old System 2: `auth-session.js` (partial)
- **Tables**: `workshop_sessions`, `workshop_step_progress`, `workshop_events`
- **Structure**: Normalized relational schema
- **Status**: Schema defined but not used by frontend
- **Advantages**:
  - Proper normalization
  - Supports detailed step tracking
  - Has audit trail (events table)
  - Already integrated with session management

## After Migration

### Unified System: `student-progress.js` (normalized V2 schema)
- **Tables**:
  - `students` - Student master records (UUID primary key)
  - `sessions` - Session management (session_token primary key, student_id foreign key)
  - `step_progress` - Granular step tracking
  - `events` - Audit log
- **Structure**: Fully normalized with proper relational integrity
- **Frontend integration**: Updated to use /api/student-progress endpoint

## Migration Steps

### 1. Run Migration (DRY RUN first)

```bash
# Test migration without making changes
curl -X POST https://your-app.vercel.app/api/migrate-unify-progress-tracking \
  -H "Content-Type: application/json" \
  -d '{
    "adminPassword": "YOUR_ADMIN_PASSWORD",
    "executeChanges": false
  }'
```

Review the output to see what will be migrated.

### 2. Execute Migration

```bash
# Actually perform migration
curl -X POST https://your-app.vercel.app/api/migrate-unify-progress-tracking \
  -H "Content-Type: application/json" \
  -d '{
    "adminPassword": "YOUR_ADMIN_PASSWORD",
    "executeChanges": true
  }'
```

### 3. Verify Data

```sql
-- Check that sessions were created
SELECT COUNT(*) FROM workshop_sessions;

-- Check that step progress was migrated
SELECT COUNT(*) FROM workshop_step_progress;

-- View sample migrated data
SELECT
  s.student_id,
  s.session_id,
  p.step_number,
  p.step_name,
  p.completed_at,
  p.validation_passed
FROM workshop_sessions s
JOIN workshop_step_progress p ON s.student_id = p.student_id
ORDER BY s.created_at DESC
LIMIT 10;
```

### 4. Deploy Frontend Changes

The frontend has been updated to use `/api/student-progress` (normalized V2 schema).

```javascript
// OLD (before migration)
fetch('/api/track-student-progress', {
  method: 'POST',
  body: JSON.stringify({
    sessionToken, studentEmail, exerciseId, completed
  })
});

// NEW (after migration)
fetch('/api/student-progress', {
  method: 'POST',
  body: JSON.stringify({
    sessionToken,
    studentEmail,
    studentName,
    stepNumber,
    stepName,
    completed
  })
});
```

### 5. Test Progress Tracking

1. Load the workshop in browser
2. Complete a step
3. Open browser console and verify logs show:
   ```
   📊 Tracking progress for student@example.com session abcd1234 (currentStep: 0, UI Step: 1)
   📝 Recording step 0 (Connect Accounts): COMPLETED
   ✅ Step 0 progress recorded successfully
   ```
4. Check database:
   ```sql
   SELECT * FROM workshop_step_progress
   WHERE student_id = 'student@example.com'
   ORDER BY step_number;
   ```

### 6. Monitor for Issues

Watch server logs for any errors:
- Session validation failures
- Progress recording failures
- Database constraint violations

### 7. Deprecate Old API (After 30 Days)

Once migration is complete and tested:

1. Add deprecation warning to `track-student-progress.js`:
   ```javascript
   console.warn('⚠️  /api/track-student-progress is deprecated. Use /api/auth-session with action=recordProgress');
   ```

2. After 30 days, remove the old API entirely

3. Optionally drop the `exercises` column from `workshop_students`:
   ```sql
   ALTER TABLE workshop_students DROP COLUMN exercises;
   ```

## Rollback Plan

If issues occur:

1. **Frontend Rollback**: Revert `index.html` changes to use old `/api/track-student-progress`
2. **Keep Old Table**: Do NOT drop `workshop_students.exercises` column until fully tested
3. **Data Integrity**: Both systems can coexist during transition period

## Data Mapping

### Old Format (JSONB in workshop_students)
```json
{
  "step-1-connect-accounts": {
    "completed": true,
    "timestamp": "2025-01-15T10:30:00Z",
    "timeSpent": 120,
    "attempts": 1
  }
}
```

### New Format (Normalized in workshop_step_progress)
```
student_id: "student@example.com"
step_number: 0
step_name: "Connect Accounts"
completed_at: 2025-01-15 10:30:00
time_spent: 120
attempts: 1
validation_passed: true
```

## Benefits of Unified System

1. **Single Source of Truth**: One API, one schema
2. **Better Queries**: SQL queries instead of JSONB path operators
3. **Audit Trail**: All events logged in `workshop_events`
4. **Session Integration**: Progress tied to authenticated sessions
5. **Scalability**: Indexed queries perform better
6. **Data Integrity**: Foreign key constraints enforce relationships

## Updated API Documentation

### Record Progress
```javascript
POST /api/student-progress
{
  "sessionToken": "ws_123...",
  "studentEmail": "student@example.com",
  "studentName": "John Doe",
  "stepNumber": 0,           // 0-indexed (0-8)
  "stepName": "Connect Accounts",
  "completed": true,
  "timeSpent": 120,          // seconds (optional)
  "codeSubmitted": "..."     // code submission (optional)
}
```

### Get Student Progress
```sql
-- Query student progress
SELECT
  step_number,
  step_name,
  started_at,
  completed_at,
  validation_passed,
  attempts
FROM workshop_step_progress
WHERE student_id = 'student@example.com'
ORDER BY step_number;
```

## Questions?

If you encounter issues during migration, check:
1. Database connection (POSTGRES_URL env var)
2. Admin password (ADMIN_PASSWORD env var)
3. Server logs for detailed error messages
4. Browser console for frontend errors
