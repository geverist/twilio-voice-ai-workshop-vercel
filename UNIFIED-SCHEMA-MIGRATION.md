# Unified Schema Migration Guide

This guide walks you through migrating your workshop database from the fragmented legacy schema to the clean, unified V2 schema.

---

## 🎯 Goals

**Before:** Multiple overlapping tables (`workshop_students`, `student_configs`) with inconsistent data

**After:** Clean, normalized schema:
- `students` - Master student records (UUID-based)
- `sessions` - **ALL session data in ONE table** with complete progress tracking
- `step_progress` - Optional granular step tracking
- `events` - Audit trail

---

## ⚠️ Prerequisites

1. **Backup your database** before starting
2. Have your `ADMIN_PASSWORD` environment variable set
3. Access to your Vercel dashboard or database directly

---

## 📋 Migration Steps

### Step 1: Backup Existing Data

```bash
# Export current data via API
curl -X POST https://your-app.vercel.app/api/admin-list-configs \
  -H "Content-Type: application/json" \
  -d '{"adminPassword": "YOUR_PASSWORD"}' \
  > backup-$(date +%Y%m%d).json
```

Or backup via PostgreSQL directly:

```bash
pg_dump $POSTGRES_URL > workshop-backup-$(date +%Y%m%d).sql
```

---

### Step 2: Create Unified Schema

**Endpoint:** `/api/admin-create-unified-schema`

```bash
curl -X POST https://your-app.vercel.app/api/admin-create-unified-schema \
  -H "Content-Type: application/json" \
  -d '{
    "adminPassword": "YOUR_ADMIN_PASSWORD",
    "dropExisting": false
  }'
```

**Parameters:**
- `adminPassword` (required): Your admin password
- `dropExisting` (optional): Set to `true` to drop existing V2 tables before creating (⚠️ use with caution!)

**This creates:**
- ✅ `students` table with UUID primary key
- ✅ `sessions` table with ALL fields (configuration + progress)
- ✅ `step_progress` table for granular tracking
- ✅ `events` table for audit trail
- ✅ Indexes on all important columns
- ✅ Triggers to auto-update `updated_at` timestamps
- ✅ Helper function `update_session_progress()`

---

### Step 3: Dry Run Migration

**Endpoint:** `/api/admin-migrate-to-unified-schema`

```bash
curl -X POST https://your-app.vercel.app/api/admin-migrate-to-unified-schema \
  -H "Content-Type: application/json" \
  -d '{
    "adminPassword": "YOUR_ADMIN_PASSWORD",
    "dryRun": true
  }'
```

**Review the output** to see:
- How many students will be migrated
- How many sessions from each source
- Any potential issues

---

### Step 4: Run Actual Migration

```bash
curl -X POST https://your-app.vercel.app/api/admin-migrate-to-unified-schema \
  -H "Content-Type: application/json" \
  -d '{
    "adminPassword": "YOUR_ADMIN_PASSWORD",
    "dryRun": false
  }'
```

**This will:**
1. Extract unique students from `workshop_students` and `student_configs`
2. Create student records in `students` table with UUIDs
3. Migrate all sessions from `workshop_students` → `sessions`
4. Merge/migrate all configs from `student_configs` → `sessions`
5. Update completion rates for all sessions
6. **Does NOT delete old tables** (for safety)

---

### Step 5: Verify Migration

#### Check Student Count

```sql
-- Should match unique student count from old tables
SELECT COUNT(*) FROM students;
SELECT COUNT(DISTINCT student_email) FROM workshop_students;
SELECT COUNT(DISTINCT student_email) FROM student_configs;
```

#### Check Session Count

```sql
SELECT COUNT(*) FROM sessions;
SELECT COUNT(*) FROM workshop_students WHERE session_token IS NOT NULL;
SELECT COUNT(*) FROM student_configs WHERE session_token IS NOT NULL;
```

#### Verify Data Integrity

```sql
-- Check for orphaned sessions (sessions without students)
SELECT COUNT(*)
FROM sessions s
LEFT JOIN students st ON s.student_id = st.student_id
WHERE st.student_id IS NULL;
-- Should be 0
```

#### Test Instructor Dashboard

1. Open `/public/instructor-dashboard.html`
2. Click "Admin Login" and enter password
3. Click "Load Sessions"
4. Verify:
   - All students appear
   - Session counts are correct
   - Progress data is accurate
   - Configuration fields are populated

---

### Step 6: Update API Endpoint (Optional)

Once verified, you can update `admin-list-configs.js` to use the V2 endpoint:

**Option A: Use new endpoint directly**

Update instructor dashboard to call `/api/admin-list-configs-v2` instead of `/api/admin-list-configs`

**Option B: Replace old endpoint**

```bash
# Backup old endpoint
mv api/admin-list-configs.js api/admin-list-configs-legacy.js

# Use new endpoint
mv api/admin-list-configs-v2.js api/admin-list-configs.js
```

---

### Step 7: Clean Up Old Tables

**⚠️ ONLY after verifying everything works!**

**Endpoint:** `/api/admin-cleanup-old-tables`

```bash
curl -X POST https://your-app.vercel.app/api/admin-cleanup-old-tables \
  -H "Content-Type: application/json" \
  -d '{
    "adminPassword": "YOUR_ADMIN_PASSWORD",
    "confirmText": "DELETE OLD TABLES"
  }'
```

This will:
1. Rename old tables with `_backup_YYYYMMDD` suffix
2. **Not actually DROP** them (so you can still recover if needed)

If you want to **permanently delete** old tables later:

```sql
-- After 30+ days of successful operation
DROP TABLE IF EXISTS workshop_students_backup_20250123 CASCADE;
DROP TABLE IF EXISTS student_configs_backup_20250123 CASCADE;
```

---

## 🗺️ Schema Comparison

### Before (Fragmented)

```
workshop_students               student_configs
├── session_token (PK)         ├── session_token (PK)
├── student_email              ├── student_email
├── student_name               ├── student_name
├── selected_phone_number      ├── selected_phone_number
├── openai_api_key             ├── openai_api_key
├── exercises (JSONB)          ├── current_step
├── demo_mode                  ├── step4_deployed
└── ...                        ├── step5_deployed
                               └── ...
```

**Issues:**
- Data split across 2 tables
- No foreign key relationships
- Inconsistent column names
- Progress in JSONB vs boolean flags

### After (Unified)

```
students                        sessions
├── student_id (UUID PK)       ├── session_token (PK)
├── student_email (UNIQUE)     ├── student_id (FK → students)
├── student_name               ├── ALL configuration fields
├── github_username            ├── ALL progress flags
├── created_at                 ├── exercises (legacy compat)
└── updated_at                 ├── completion_rate (auto-calc)
                               ├── current_step
                               └── ...
```

**Benefits:**
- ✅ Single source of truth for sessions
- ✅ Proper foreign key relationships
- ✅ Consistent naming and types
- ✅ Easy to query and maintain
- ✅ UUID-based student IDs (immutable)

---

## 📊 New Session Table Fields

The unified `sessions` table includes **ALL fields from both old tables:**

### Configuration Fields
- `selected_phone_number`
- `selected_voice`
- `tts_provider`
- `call_direction`
- `use_case_description`

### AI Settings
- `openai_api_key` (encrypted at app layer)
- `system_prompt`
- `ivr_greeting`
- `tools` (JSONB)
- `voice_settings` (JSONB)

### Deployment URLs
- `websocket_url`
- `codespace_url`
- `github_repo_url`
- `railway_url`

### Progress Tracking (Boolean Flags)
- `twilio_connected`
- `openai_connected`
- `call_direction_chosen`
- `services_ready`
- `step4_code_validated`, `step4_committed`, `step4_deployed`
- `step5_code_validated`, `step5_committed`, `step5_deployed`
- `step6_code_validated`, `step6_committed`, `step6_deployed`
- `system_prompt_saved`
- `step7_committed`, `step7_deployed`
- `tools_configured`
- `step8_code_validated`, `step8_committed`, `step8_deployed`
- `project_deployed`

### Computed Fields
- `current_step` - Current workshop step (0-9)
- `completion_rate` - Percentage complete (0-100)
- `total_time_spent` - Seconds spent in workshop

### Legacy Compatibility
- `exercises` (JSONB) - Preserved from old `workshop_students` table

---

## 🔧 Troubleshooting

### "Unified schema not found"

You need to run Step 2 first to create the tables.

### "Duplicate key value violates unique constraint"

This means the migration was already run. Check if data already exists:

```sql
SELECT COUNT(*) FROM students;
SELECT COUNT(*) FROM sessions;
```

### Missing data after migration

1. Check the migration output for error messages
2. Verify old tables still exist (not dropped)
3. Run the migration again - it will merge/update existing records

### Instructor dashboard shows no data

1. Verify API endpoint: Check browser console for errors
2. Make sure you're calling the V2 endpoint
3. Check database connection: `SELECT COUNT(*) FROM sessions;`

---

## 🚀 Next Steps After Migration

1. **Update other API endpoints** to use unified schema:
   - `student-config-save.js`
   - `student-config-get.js`
   - `track-student-progress.js`

2. **Add new features** enabled by clean schema:
   - Student dashboard showing all their sessions
   - Analytics on step completion rates
   - Time-based progress reports

3. **Clean up codebase**:
   - Remove legacy migration scripts
   - Delete conditional table checks
   - Simplify queries

---

## 📝 Rollback Plan

If something goes wrong:

1. Old tables are **NOT deleted** by migration
2. You can continue using old endpoints
3. Drop V2 tables and start over:

```sql
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS step_progress CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS students CASCADE;
```

Then re-run from Step 2.

---

## ✅ Success Criteria

Migration is successful when:

- ✅ All students migrated: `SELECT COUNT(*) FROM students;`
- ✅ All sessions migrated: `SELECT COUNT(*) FROM sessions;`
- ✅ No orphaned sessions: Foreign keys intact
- ✅ Instructor dashboard loads and shows correct data
- ✅ Progress percentages calculated correctly
- ✅ No API errors in production logs

---

## 📞 Support

If you encounter issues:

1. Check the migration output logs
2. Verify your backup is safe
3. Review the SQL queries in the migration script
4. Open an issue with:
   - Migration output
   - Error messages
   - Table counts before/after

---

**🎉 After successful migration, your database will be clean, consistent, and easy to maintain!**
