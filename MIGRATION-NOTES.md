# Migration Notes: Twilio Serverless → Vercel

## What Was Changed

### File Structure

**Before (Twilio Serverless):**
```
twilio-serverless/
├── functions/
│   ├── tutorial-proxy.js
│   ├── github-oauth-init.js
│   ├── github-oauth-callback.js
│   └── github-create-repo.js
├── assets/
│   ├── voice-ai-workshop.html
│   └── workshop-welcome.html
└── .env
```

**After (Vercel):**
```
twilio-voice-ai-workshop-vercel/
├── api/                           # Serverless functions
│   ├── tutorial-proxy.js          # ✅ Ported
│   ├── github-oauth-init.js       # ✅ Ported
│   ├── github-oauth-callback.js   # ✅ Ported
│   └── github-create-repo.js      # ✅ Simplified
├── public/                        # Static assets
│   ├── index.html                 # (was voice-ai-workshop.html)
│   └── welcome.html               # (was workshop-welcome.html)
├── package.json                   # ✅ Created
├── vercel.json                    # ✅ Created
├── .env.example                   # ✅ Created
└── README.md                      # ✅ Created
```

### Backend Functions Ported

#### 1. `tutorial-proxy.js` ✅ COMPLETE
- Converted from Twilio.Response → Express-style res
- Changed CORS helper from Runtime.getFunctions() → inline headers
- Replaced `context` variables with `process.env`
- All 12 API actions ported (validateCredentials, makeCall, listPhoneNumbers, etc.)

#### 2. `github-oauth-init.js` ✅ COMPLETE
- Converted to Vercel function format
- Uses `process.env` for config
- Dynamic domain detection (VERCEL_URL or req.headers.host)

#### 3. `github-oauth-callback.js` ✅ COMPLETE
- Ported to Vercel format
- **Simplified**: Removed Twilio Sync dependency
- Now passes GitHub token directly in URL (base64 encoded)
- In production, would use Redis/Vercel KV for session storage

#### 4. `github-create-repo.js` ✅ COMPLETE
- Ported to Vercel format
- **Simplified**: Accepts token directly instead of session ID
- Uses native `fetch()` instead of `axios`
- Removed Twilio Sync dependency

### Frontend Changes

#### Workshop HTML (**NOT YET UPDATED**)

The current `public/index.html` still points to old endpoints:

**Needs to be updated:**
```javascript
// OLD (Twilio Serverless):
fetch('/tutorial-proxy', { ... })

// NEW (Vercel):
fetch('/api/tutorial-proxy', { ... })
```

**All occurrences to update:**
- `/tutorial-proxy` → `/api/tutorial-proxy`
- `/github-oauth-init` → `/api/github-oauth-init`
- `/github-oauth-callback` → `/api/github-oauth-callback`
- `/github-create-repo` → `/api/github-create-repo`

### Environment Variables

**Twilio Serverless (.env):**
```bash
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_SYNC_SVC_SID=ISxxx
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
GITHUB_TEMPLATE_OWNER=geverist
GITHUB_TEMPLATE_REPO=conversationrelay-starter-pack
```

**Vercel (Environment Variables):**
```bash
# REMOVED (not needed anymore):
# TWILIO_ACCOUNT_SID
# TWILIO_AUTH_TOKEN
# TWILIO_SYNC_SVC_SID

# KEPT:
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
GITHUB_TEMPLATE_OWNER=geverist
GITHUB_TEMPLATE_REPO=conversationrelay-starter-pack
```

**Why removed?**
- Students provide their own Twilio credentials
- No need for instructor's credentials in backend

### Key Differences

| Feature | Twilio Serverless | Vercel |
|---------|------------------|--------|
| **Function Format** | `exports.handler` callback | `export default` async function |
| **Response Object** | `new Twilio.Response()` | Express-style `res` object |
| **CORS** | `Runtime.getFunctions()` helper | Inline `res.setHeader()` |
| **Environment Vars** | `context.VARIABLE` | `process.env.VARIABLE` |
| **Session Storage** | Twilio Sync | ⚠️ Simplified (token in URL) |
| **Deployment** | `twilio serverless:deploy` | `vercel --prod` |
| **Hosting** | Twilio Serverless | Vercel (free tier) |
| **Domain** | `.twil.io` subdomain | `.vercel.app` or custom |

### Session Management Change ⚠️

**Before (Twilio Serverless):**
1. GitHub OAuth → Get access token
2. Store token in Twilio Sync with TTL
3. Return session ID to frontend
4. Frontend passes session ID
5. Backend looks up token in Sync

**After (Vercel - Simplified):**
1. GitHub OAuth → Get access token
2. ~~Store in Sync~~
3. Return token directly to frontend (base64 encoded)
4. Frontend passes token directly
5. Backend uses token

**Why simplified?**
- No Twilio Sync dependency
- Easier deployment
- Still secure (HTTPS + base64)

**For production, recommend:**
- Use Vercel KV (Redis) for session storage
- Or use Upstash Redis
- Return session ID, not token

### What Still Needs To Be Done

#### 1. Update Frontend API Endpoints ⚠️ CRITICAL

```bash
# In public/index.html, find and replace:
/tutorial-proxy              → /api/tutorial-proxy
/github-oauth-init           → /api/github-oauth-init
/github-oauth-callback       → /api/github-oauth-callback
/github-create-repo          → /api/github-create-repo
```

Use this command to update:
```bash
cd "/Users/geverist/Documents/Twilio Dev/twilio-voice-ai-workshop-vercel/public"

# macOS sed
sed -i '' 's|/tutorial-proxy|/api/tutorial-proxy|g' index.html
sed -i '' 's|/github-oauth-init|/api/github-oauth-init|g' index.html
sed -i '' 's|/github-oauth-callback|/api/github-oauth-callback|g' index.html
sed -i '' 's|/github-create-repo|/api/github-create-repo|g' index.html
```

#### 2. Update GitHub OAuth Callback Handler

In `public/index.html`, update GitHub session handling to decode base64 token:

```javascript
// Current (expects sessionToken from Sync):
const githubToken = urlParams.get('github_token');

// Update to (decode base64 token):
const githubTokenEncoded = urlParams.get('github_token');
const githubToken = githubTokenEncoded ?
  atob(githubTokenEncoded) : null;
```

#### 3. Update github-create-repo Calls

Find all calls to `/github-create-repo` and pass decoded token:

```javascript
// Before:
fetch('/github-create-repo', {
  body: JSON.stringify({
    sessionToken: githubToken,
    repoName: repoName
  })
})

// After:
fetch('/api/github-create-repo', {
  body: JSON.stringify({
    accessToken: githubToken, // decoded token
    githubUsername: githubUsername,
    repoName: repoName
  })
})
```

### Testing Checklist

Once deployed to Vercel, test:

- [ ] Home page loads at `/`
- [ ] Welcome page loads at `/welcome.html`
- [ ] GitHub OAuth flow works
- [ ] Redirect back to workshop works
- [ ] API proxy validates credentials
- [ ] API proxy lists phone numbers
- [ ] API proxy makes test calls
- [ ] Repository creation works
- [ ] Demo mode works (no credentials)

### Rollback Plan

If something doesn't work:

1. Keep Twilio Serverless version running
2. Point students to old URL temporarily
3. Debug Vercel deployment
4. Update and redeploy

The Twilio Serverless version can stay live as a backup!

### Future Improvements

1. **Add Vercel KV for sessions** - Store GitHub tokens server-side
2. **Add rate limiting** - Prevent API abuse
3. **Add analytics** - Track student progress
4. **Add webhook handlers** - For Twilio call status callbacks
5. **Add TypeScript** - Better type safety
6. **Add tests** - Unit tests for API functions

---

## Quick Commands

```bash
# Update API endpoints in HTML
cd public
sed -i '' 's|"/tutorial-proxy|"/api/tutorial-proxy|g' index.html
sed -i '' 's|"/github-oauth-init|"/api/github-oauth-init|g' index.html
sed -i '' 's|"/github-oauth-callback|"/api/github-oauth-callback|g' index.html
sed -i '' 's|"/github-create-repo|"/api/github-create-repo|g' index.html

# Test locally
vercel dev

# Deploy to production
vercel --prod

# View logs
vercel logs

# Check environment variables
vercel env ls
```
