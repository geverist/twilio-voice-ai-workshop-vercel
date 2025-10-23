# Railway WebSocket Server Update Required

## Current Status

✅ **Code Updated**: `server/websocket-server.js` has been updated and pushed to GitHub
❌ **Railway Deployment**: Still running OLD code (expects `apiKey`, not `sessionToken`)

---

## What Changed

### Old WebSocket URL Format
```
wss://your-railway-app.up.railway.app?apiKey=sk-xxx&sessionId=test
```

### New WebSocket URL Format
```
wss://your-railway-app.up.railway.app?sessionToken=ws_xxx
```

### Key Changes in `server/websocket-server.js`

1. **Changed Parameter**: `apiKey` → `sessionToken`
2. **Fetches Settings**: Calls Vercel API to get student settings
3. **Auto-Decrypts**: OpenAI key decrypted automatically
4. **Custom Prompts**: Uses student's custom system prompt
5. **Fallback**: Uses instructor's `OPENAI_API_KEY` env var if student hasn't configured

---

## How to Update Railway Deployment

### Option 1: Automatic Redeploy (if configured)

If Railway is connected to GitHub and watching for changes:

1. **Push triggers deploy**: Already done! (commit `370a516`)
2. **Railway auto-deploys**: Should happen automatically
3. **Wait 2-5 minutes**: For build and deployment

**Check deployment status**:
```bash
# Via Railway CLI
railway status

# Or check Railway dashboard
https://railway.app/
```

---

### Option 2: Manual Redeploy

If auto-deploy isn't working:

1. **Go to Railway Dashboard**: https://railway.app/
2. **Find the project**: `workshop-websocket-server`
3. **Click "Deploy"**: Force a new deployment
4. **Select latest commit**: `370a516` - "Update Railway WebSocket server to use student OpenAI keys"

---

### Option 3: Redeploy via Railway CLI

```bash
# Install Railway CLI (if not installed)
npm install -g @railway/cli

# Login to Railway
railway login

# Link to project
railway link

# Trigger deployment
railway up
```

---

## Required Environment Variables

Make sure these are set in Railway:

```bash
# Required: URL of your Vercel API
VERCEL_API_URL=https://twilio-voice-ai-workshop-vercel.vercel.app

# Optional: Fallback key for students who haven't configured theirs
OPENAI_API_KEY=sk-proj-...
```

**To set in Railway dashboard**:
1. Go to your Railway project
2. Click on the service
3. Go to "Variables" tab
4. Add:
   - `VERCEL_API_URL` = `https://twilio-voice-ai-workshop-vercel.vercel.app`
   - `OPENAI_API_KEY` = Your instructor fallback key

---

## Testing After Deployment

### Test 1: Health Check
```bash
curl https://workshop-websocket-server-production.up.railway.app/
```

**Expected**:
```json
{
  "status": "running",
  "message": "WebSocket server is running",
  "websocketUrl": "ws://..."
}
```

---

### Test 2: WebSocket Connection

Run the test script:
```bash
node test-railway-websocket.js
```

**Expected Output**:
```
🧪 Testing Railway WebSocket Server
✅ WebSocket connected!
📤 Sending test prompt...
📨 Received message: text
✅ AI Response: Hello! How can I help you today?
🎉 SUCCESS! Railway WebSocket is:
   ✅ Accepting sessionToken parameter
   ✅ Retrieving student settings from Vercel
   ✅ Using OpenAI key to generate response
```

---

### Test 3: Check Logs

Railway logs should show:
```
[ws_test...] WebSocket connected (session: ws_test_direct_encryption)
[ws_test...] Loaded custom settings for session ws_test_direct_encryption
[ws_test...] ✅ Using student's OpenAI API key
[ws_test...] Caller said: Say hello
[ws_test...] AI response: Hello! How can I help you today?
```

---

## Troubleshooting

### Issue: "Connection closed immediately"

**Cause**: Railway is still running OLD code

**Fix**:
1. Check Railway dashboard for deployment status
2. Force redeploy if needed
3. Verify latest commit (`370a516`) is deployed

---

### Issue: "Failed to fetch settings"

**Cause**: `VERCEL_API_URL` not set in Railway

**Fix**:
```bash
railway variables set VERCEL_API_URL=https://twilio-voice-ai-workshop-vercel.vercel.app
```

---

### Issue: "No OpenAI API key available"

**Cause**: Student hasn't configured key AND no fallback set

**Fix**:
1. Student should configure OpenAI key in workshop Step 1
2. OR set instructor's fallback key:
   ```bash
   railway variables set OPENAI_API_KEY=sk-proj-...
   ```

---

## What Students Need to Do

### After Railway Server is Updated

**Nothing!** The change is transparent to students:

1. ✅ They already have `sessionToken` from Step 1
2. ✅ Their OpenAI keys are already encrypted in database
3. ✅ WebSocket server will automatically fetch their settings
4. ✅ They'll be billed for their own OpenAI usage

### If Students Have Already Deployed

If students deployed their own Railway servers before this update:

1. **Pull latest code**:
   ```bash
   git pull origin main
   ```

2. **Railway auto-redeploys** (if connected to GitHub)
   - OR manually redeploy via Railway dashboard

3. **Set environment variables** (if not set):
   ```bash
   railway variables set VERCEL_API_URL=https://twilio-voice-ai-workshop-vercel.vercel.app
   railway variables set OPENAI_API_KEY=<their-fallback-key>
   ```

---

## Migration Summary

| Aspect | Before | After |
|--------|--------|-------|
| **URL Parameter** | `?apiKey=sk-xxx` | `?sessionToken=ws_xxx` |
| **OpenAI Key Source** | Query parameter | Vercel API (decrypted from DB) |
| **System Prompt** | Hardcoded | Student's custom prompt |
| **Billing** | Whoever provided `apiKey` | Student's OpenAI account |
| **Settings** | None | Full student config loaded |

---

## Current Deployment URLs

| Service | URL | Status |
|---------|-----|--------|
| **Vercel API** | https://twilio-voice-ai-workshop-vercel.vercel.app | ✅ Updated |
| **Railway WebSocket** | wss://workshop-websocket-server-production.up.railway.app | ⚠️ Needs redeploy |

---

## Next Steps

1. ✅ Code committed and pushed to GitHub (`370a516`)
2. ⏳ **Update Railway deployment** (see options above)
3. ⏳ **Set environment variables** in Railway
4. ⏳ **Test with `test-railway-websocket.js`**
5. ⏳ **Verify student calls work** end-to-end

---

**Last Updated**: January 23, 2025
**Commit**: `370a516` - Update Railway WebSocket server to use student OpenAI keys
