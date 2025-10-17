# Deployment Guide for Twilio Voice AI Workshop on Vercel

## What's New: Postgres Backend!

This workshop now uses **Vercel Postgres** instead of Twilio Sync for:
- ✅ More reliable session storage
- ✅ Better analytics and reporting
- ✅ Lower cost (<$1/month vs variable Sync costs)
- ✅ Full SQL query support
- ✅ Complete instructor dashboard with student tracking

## Quick Deploy (You Already Have Vercel Account!)

### Step 1: Initialize Git Repository

```bash
cd "/Users/geverist/Documents/Twilio Dev/twilio-voice-ai-workshop-vercel"

git init
git add .
git commit -m "Initial commit: Twilio Voice AI Workshop for Vercel"
```

### Step 2: Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `twilio-voice-ai-workshop`
3. Description: "Interactive workshop for building AI voice assistants with Twilio"
4. **Public** (so students can see it)
5. Don't initialize with README (we already have one)
6. Click **Create repository**

### Step 3: Push to GitHub

```bash
git remote add origin https://github.com/geverist/twilio-voice-ai-workshop.git
git branch -M main
git push -u origin main
```

### Step 4: Deploy to Vercel

Since you already have a Vercel account, this is super easy:

```bash
# Install Vercel CLI if not installed
npm install -g vercel

# Deploy (from the project directory)
vercel

# Follow prompts:
# ? Set up and deploy? Y
# ? Which scope? (select your Vercel account)
# ? Link to existing project? N
# ? What's your project's name? twilio-voice-ai-workshop
# ? In which directory is your code located? ./
# ? Want to override the settings? N
```

Vercel will give you a URL like: `https://twilio-voice-ai-workshop-xxx.vercel.app`

### Step 5: Create Postgres Database

**IMPORTANT: This step is required for the new Postgres backend!**

```bash
# Create Postgres database (links to your Vercel project)
vercel storage create postgres workshop-db

# This automatically adds these environment variables:
# - POSTGRES_URL
# - POSTGRES_PRISMA_URL
# - POSTGRES_URL_NON_POOLING
# - POSTGRES_USER
# - POSTGRES_HOST
# - POSTGRES_PASSWORD
# - POSTGRES_DATABASE
```

### Step 6: Initialize Database Schema

```bash
# Pull environment variables to local
vercel env pull .env.local

# Install dependencies
npm install

# Run database initialization
node db/init.js
```

You should see:
```
🔧 Initializing Vercel Postgres database...
📝 Executing SQL statements...
✅ Database initialization complete!

Created tables:
  - workshop_sessions (replaces Twilio Sync)
  - workshop_students
  - workshop_step_progress
  - workshop_invitations
  - workshop_events
```

### Step 7: Configure GitHub OAuth App (Optional)

1. Go to https://github.com/settings/developers
2. Click **New OAuth App**
3. Fill in:
   - **Application name**: `Twilio Voice AI Workshop`
   - **Homepage URL**: `https://twilio-voice-ai-workshop-xxx.vercel.app` (your Vercel URL)
   - **Authorization callback URL**: `https://twilio-voice-ai-workshop-xxx.vercel.app/api/github-oauth-callback`
4. Click **Register application**
5. **Copy the Client ID**
6. Click **Generate a new client secret** and copy it

### Step 8: Add Environment Variables to Vercel

**Required for Instructor Dashboard:**

```bash
# SendGrid (for email invitations)
vercel env add SENDGRID_API_KEY production
# Get API key from: https://app.sendgrid.com/settings/api_keys

vercel env add INSTRUCTOR_EMAIL production
# Your email address

vercel env add INSTRUCTOR_NAME production
# Your name

vercel env add WORKSHOP_URL production
# Your Vercel URL (e.g., https://twilio-voice-ai-workshop-xxx.vercel.app)

# Cron job secret (for automatic session cleanup)
vercel env add CRON_SECRET production
# Generate with: openssl rand -hex 32
```

**Optional (GitHub OAuth - if using GitHub deployment features):**

```bash
vercel env add GITHUB_CLIENT_ID production
# From GitHub OAuth App

vercel env add GITHUB_CLIENT_SECRET production
# From GitHub OAuth App

vercel env add GITHUB_TEMPLATE_OWNER production
# Enter: geverist

vercel env add GITHUB_TEMPLATE_REPO production
# Enter: conversationrelay-starter-pack
```

### Step 9: Redeploy with Environment Variables

```bash
vercel --prod
```

This will deploy to production with your environment variables and Postgres database.

### Step 10: Test Your Workshop!

**Test Student Workshop:**
1. Visit: `https://your-workshop.vercel.app/`
2. You should see the workshop welcome page
3. Enter Twilio credentials to test (or use demo mode)
4. Complete exercises

**Test Instructor Dashboard:**
1. Visit: `https://your-workshop.vercel.app/instructor-dashboard.html`
2. You should see 4 tabs:
   - **Student Progress** - Analytics and student tracking
   - **Send Single Invitation** - Email one student
   - **Bulk Send** - Upload CSV to invite multiple students
   - **Invitation History** - Track sent invitations

**Test API Endpoints:**
```bash
# Test student progress API
curl "https://your-workshop.vercel.app/api/track-student-progress?getAllStudents=true"

# Should return: {"success":true,"students":[],"summary":{...}}
```

## 🎉 Done!

Your workshop is now live with:
- ✅ Postgres backend for reliable data storage
- ✅ Instructor dashboard with analytics
- ✅ Email invitations via SendGrid
- ✅ Automatic session cleanup (cron job)
- ✅ Complete student progress tracking

### Workshop URLs

- **Student Portal**: `https://your-workshop.vercel.app/`
- **Instructor Dashboard**: `https://your-workshop.vercel.app/instructor-dashboard.html`

### Next Steps

1. **Send first invitation**: Use instructor dashboard to invite a student
2. **Test as student**: Complete the workshop yourself to verify everything works
3. **Monitor analytics**: Check student progress in instructor dashboard
4. **Share with students**: Send them the workshop URL
5. **Monitor**: Check Vercel dashboard for function logs and database metrics

## Updating the Workshop

Whenever you make changes:

```bash
git add .
git commit -m "Update workshop content"
git push

# Vercel will automatically redeploy!
# Or manually trigger:
vercel --prod
```

## Custom Domain (Optional)

Want a custom domain like `workshop.yourdomain.com`?

1. Go to Vercel Dashboard → Your Project → Settings → Domains
2. Add your custom domain
3. Follow Vercel's DNS configuration instructions
4. Update GitHub OAuth App callback URL to use new domain

## Database Management

### View Database in Vercel Dashboard

1. Go to https://vercel.com/dashboard
2. Select your project
3. Go to **Storage** tab
4. Click on `workshop-db`
5. You can query directly from the dashboard

### Common Queries

```sql
-- View all students
SELECT * FROM workshop_students ORDER BY last_activity DESC LIMIT 10;

-- View active students
SELECT * FROM active_students;

-- Get workshop summary
SELECT * FROM workshop_analytics;

-- Check session count
SELECT COUNT(*) FROM workshop_sessions WHERE expires_at > NOW();

-- View recent events
SELECT * FROM workshop_events ORDER BY created_at DESC LIMIT 20;
```

### Manual Session Cleanup

```bash
curl -X POST "https://your-workshop.vercel.app/api/cleanup-sessions" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## Troubleshooting

### Database not initialized

**Error:** `relation "workshop_students" does not exist`

**Fix:**
```bash
vercel env pull .env.local
node db/init.js
```

### SendGrid emails not sending

**Error:** Invitations recorded but emails not sent

**Cause:** `SENDGRID_API_KEY` not configured

**Fix:**
```bash
vercel env add SENDGRID_API_KEY production
vercel --prod
```

### Cron job not running

**Check:** Vercel dashboard → Project → Cron Jobs

**Note:** Cron jobs require Vercel Pro plan ($20/month)

**Workaround:** Run cleanup manually via API call (shown above)

### "Origin not allowed" CORS error

- Check `vercel.json` has correct CORS headers
- Redeploy after making changes

### API calls not working

- Check Vercel function logs: `vercel logs`
- Verify Twilio credentials are valid
- Test API endpoints directly: `curl https://your-app.vercel.app/api/tutorial-proxy`

### Template literal syntax error

**Fixed!** Line 6634 in `index.html` had a template literal inside a template literal. This has been resolved by escaping the inner backticks.

## Performance Monitoring

Vercel provides built-in analytics:

1. Go to your project dashboard
2. Click **Analytics** tab
3. Monitor:
   - Page views
   - Function invocations
   - Errors
   - Performance

## Cost Breakdown

### Vercel Free Tier
- ✅ Unlimited deployments
- ✅ 100GB bandwidth/month
- ✅ Serverless functions (generous limits)
- ✅ Custom domains

### Vercel Postgres Free Tier
- ✅ 256 MB storage (enough for 10,000+ students)
- ✅ 60 compute hours/month
- ✅ Connection pooling included

**Estimated cost for 100 students:** <$1/month

### SendGrid Free Tier
- ✅ 100 emails/day forever
- Perfect for workshop invitations

### Total Monthly Cost

| Students | Vercel | Postgres | SendGrid | **Total** |
|----------|--------|----------|----------|-----------|
| 0-100    | $0     | $0       | $0       | **$0**    |
| 100-500  | $0     | $0-1     | $0       | **<$1**   |
| 500+     | $20*   | $1-5     | $0       | **$21-25**|

*Vercel Pro required for cron jobs

## Support & Resources

- **Postgres Documentation**: See `/db/README.md` for detailed schema and queries
- **API Documentation**: All endpoints documented in code comments
- **Vercel Support**: https://vercel.com/support
- **GitHub Issues**: Report bugs and request features

---

Questions? Check the `/db/README.md` or open an issue on GitHub!

## Summary of What You Built

✅ **Complete workshop platform** with interactive tutorial
✅ **Postgres backend** for reliable data storage (replaces Twilio Sync)
✅ **Instructor dashboard** with 4 tabs:
  - Student progress analytics
  - Single email invitations
  - Bulk CSV upload
  - Invitation history
✅ **5 new API endpoints**:
  - `/api/auth-session` - Session management
  - `/api/track-student-progress` - Analytics
  - `/api/send-workshop-invitation` - Email invitations
  - `/api/cleanup-sessions` - Cron job
  - `/api/workshop-analytics` - Summary stats
✅ **Automatic session cleanup** (hourly cron job)
✅ **Complete database schema** with 5 tables, 2 views, 2 functions
✅ **Fixed template literal bug** in index.html:6634

**Next step:** Run `vercel --prod` to deploy! 🚀
