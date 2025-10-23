# Workshop Step 5 - WebSocket Deployment Testing

**Purpose**: Verify student's Railway WebSocket deployment is ready for ConversationRelay

## Overview

In Workshop Step 5, students deploy their WebSocket server to Railway. This test confirms:
- ✅ WebSocket server is deployed and accessible
- ✅ Server accepts sessionToken in path format (`/ws/{sessionToken}`)
- ✅ Server fetches student settings from Vercel API
- ✅ Student's OpenAI key is decrypted automatically
- ✅ Server can process ConversationRelay prompts
- ✅ AI responses are generated successfully

## Test Script

```bash
node test-student-deployment.js
```

### With Custom Session Token

```bash
node test-student-deployment.js ws_your_session_token_here
```

### With Custom Railway URL

```bash
node test-student-deployment.js ws_token wss://your-app.up.railway.app
```

## Expected Output

### ✅ Successful Test

```
🧪 Testing Student WebSocket Deployment (Workshop Step 5)

📋 Test Configuration:
   Railway Server: wss://workshop-websocket-server-production.up.railway.app
   Session Token: ws_test_direct_encryption
   Expected: Server fetches settings from Vercel API

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔌 Connecting to: wss://workshop-websocket-server-production.up.railway.app/ws/ws_test_direct_encryption

✅ WebSocket connected!
   → Server should be fetching your settings from Vercel API...
   → Your OpenAI key will be decrypted automatically

📤 Sending test ConversationRelay prompt...
   Prompt: "Say hello in one sentence"

📨 Received AI Response:
   Type: text
   Response: "Hello! How can I assist you today?"
   Final: true

🎉 SUCCESS! Your Railway deployment is ready!

✅ Verified:
   ✓ WebSocket server deployed to Railway
   ✓ Accepts sessionToken in path format
   ✓ Retrieves student settings from Vercel
   ✓ OpenAI key decrypted and working
   ✓ Can process ConversationRelay prompts
   ✓ Generates AI responses successfully

🚀 Next Step (Workshop Step 6):
   Your WebSocket server is ready for ConversationRelay!
   Copy this URL for Step 6:
   wss://workshop-websocket-server-production.up.railway.app/ws/{your_session_token}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Student WebSocket Deployment Test PASSED
```

### ❌ Failed Test - No Response

```
❌ Test timeout - no response from server

💡 Troubleshooting:
   1. Is your Railway server deployed and running?
   2. Check Railway logs for errors
   3. Verify VERCEL_API_URL environment variable is set in Railway:
      VERCEL_API_URL=https://twilio-voice-ai-workshop-vercel.vercel.app
   4. Verify OPENAI_API_KEY is set in Railway (fallback)
```

**Common Causes**:
- Railway server running old code (needs redeploy)
- Missing `VERCEL_API_URL` environment variable
- Missing `OPENAI_API_KEY` fallback
- Student hasn't configured OpenAI key in Step 1

### ❌ Failed Test - Connection Error

```
❌ WebSocket connection error: getaddrinfo ENOTFOUND

💡 Common Issues:
   • Railway deployment failed (check Railway dashboard)
   • Wrong Railway URL (verify your app URL)
   • Network/firewall blocking WebSocket connection
```

**Common Causes**:
- Railway app not deployed yet
- Incorrect Railway URL
- Network/firewall issues

## Required Railway Environment Variables

Students must set these in Railway dashboard:

### Required
```bash
VERCEL_API_URL=https://twilio-voice-ai-workshop-vercel.vercel.app
```

### Optional (Fallback)
```bash
OPENAI_API_KEY=sk-proj-...
```
*Used when student hasn't configured their own key yet*

## How to Set Environment Variables in Railway

1. **Go to Railway Dashboard**: https://railway.app/
2. **Select Your Project**: Click on your WebSocket server project
3. **Open Variables Tab**: Click "Variables" in the sidebar
4. **Add Variables**:
   - Variable: `VERCEL_API_URL`
   - Value: `https://twilio-voice-ai-workshop-vercel.vercel.app`
   - Click "Add"

5. **Add Fallback Key (Optional)**:
   - Variable: `OPENAI_API_KEY`
   - Value: Your instructor's fallback key
   - Click "Add"

6. **Redeploy**: Railway should automatically redeploy with new variables

## Architecture

```
┌─────────────┐
│  Student    │
│  Browser    │
└──────┬──────┘
       │ 1. Configure OpenAI key (Step 1)
       │    Encrypted & saved to database
       ↓
┌─────────────────────┐
│  Vercel API         │
│  (Encryption)       │
├─────────────────────┤
│ • Encrypts keys     │
│ • Stores in DB      │
│ • Decrypts on       │
│   demand            │
└──────┬──────────────┘
       │ 2. Fetch settings with decrypted key
       │    GET /api/get-student-ai-settings?sessionToken=ws_xxx
       ↓
┌─────────────────────┐
│  Railway            │
│  WebSocket Server   │
├─────────────────────┤
│ • Receives          │
│   sessionToken      │
│ • Fetches from      │
│   Vercel API        │
│ • Uses decrypted    │
│   OpenAI key        │
│ • Processes         │
│   ConversationRelay │
└─────────────────────┘
       │ 3. AI response
       ↓
┌─────────────┐
│  Twilio     │
│  Voice Call │
└─────────────┘
```

## What the Test Does

1. **Connects to Railway WebSocket**:
   ```
   wss://your-app.up.railway.app/ws/{sessionToken}
   ```

2. **Sends ConversationRelay Prompt**:
   ```json
   {
     "type": "prompt",
     "voicePrompt": "Say hello in one sentence"
   }
   ```

3. **Expects AI Response**:
   ```json
   {
     "type": "text",
     "token": "Hello! How can I assist you today?",
     "last": true
   }
   ```

4. **Verifies End-to-End Flow**:
   - Railway server connects ✓
   - Fetches settings from Vercel ✓
   - Decrypts OpenAI key ✓
   - Calls OpenAI API ✓
   - Returns response ✓

## For Instructors

### Testing Production Railway Server

Use the default test (points to instructor's Railway):
```bash
node test-student-deployment.js
```

### Testing with Different Session Tokens

Test with different student sessions:
```bash
# Student Alice
node test-student-deployment.js ws_student_alice_789

# Student Bob
node test-student-deployment.js ws_student_bob_012

# Test user
node test-student-deployment.js ws_test_direct_encryption
```

### Checking Railway Logs

```bash
# Via Railway CLI
railway logs

# Or check Railway dashboard
https://railway.app/project/{your-project}/deployments
```

Look for these log messages:
- `📞 New connection for session: ws_xxx...`
- `🔍 Fetching settings from: https://...`
- `✅ Loaded config for student: {name}`
- `   OpenAI key: ✓ Available (decrypted)`
- `🤖 {student} - Calling OpenAI...`
- `✅ {student} - OpenAI responded successfully`

## Troubleshooting

### Issue: "Test timeout - no response"

**Check Railway Logs**:
```bash
railway logs
```

**Look for**:
- `❌ Failed to fetch settings: 404` → Session token not in database
- `❌ Error loading student config` → Network/API issue
- OpenAI errors → Check API key validity

**Fix**:
1. Verify student configured OpenAI key in Step 1
2. Set `VERCEL_API_URL` in Railway
3. Set `OPENAI_API_KEY` fallback in Railway
4. Redeploy Railway app

### Issue: "Connection error"

**Check**:
1. Railway app deployed? Check dashboard
2. Correct Railway URL? Verify in Railway settings
3. Network issues? Try from different network

### Issue: "No config found for session"

**Cause**: Session token doesn't exist in database

**Fix**:
- Student needs to complete Step 1 (Account Configuration)
- Save their OpenAI API key in the workshop UI
- Session token should be saved to database

### Issue: "Using instructor's OpenAI API key (fallback)"

**This is OK!** It means:
- Student hasn't configured their own key yet
- Server is using instructor's fallback key
- Student won't be billed for OpenAI usage

**To use student's key**:
- Student must configure OpenAI key in Step 1
- Key gets encrypted and saved to database
- Railway fetches and decrypts it automatically

## Related Files

- **Test Script**: `test-student-deployment.js`
- **Railway Server**: `/workshop-websocket-server/server.js`
- **Vercel API**: `/api/get-student-ai-settings.js`
- **Encryption**: `/api/_lib/encryption.js`
- **Local Test**: `test-websocket-flow.js` (tests Vercel locally)
- **Railway Test**: `test-railway-websocket.js` (same as student test)

## Next Steps After Test Passes

1. ✅ Student's Railway WebSocket server is ready
2. → Proceed to **Workshop Step 6: ConversationRelay**
3. → Configure Twilio phone number to use WebSocket URL
4. → Make test call to verify end-to-end

---

**Last Updated**: January 23, 2025
**Test Created For**: Workshop Step 5 - WebSocket Handler Deployment
