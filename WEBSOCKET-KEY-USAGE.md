# WebSocket Server: Student OpenAI Key Usage

## Overview

The workshop's shared WebSocket server now retrieves and uses **each student's OpenAI API key** instead of a single instructor's key. This ensures students are billed for their own API usage and can customize their AI behavior.

---

## Architecture Changes

### Before (Old Approach)
```javascript
// api/workshop-websocket.js
const openaiApiKey = process.env.OPENAI_API_KEY; // Instructor's key for all students
const openai = new OpenAI({ apiKey: openaiApiKey });
```

**Problems:**
- ❌ Instructor pays for all students' API usage
- ❌ No cost transparency for students
- ❌ Single point of failure (one rate limit for all)
- ❌ Can't track individual student usage

---

### After (New Approach)
```javascript
// api/workshop-websocket.js

// 1. Retrieve student's settings (includes decrypted OpenAI key)
const settingsResponse = await fetch(
  `/api/get-student-ai-settings?sessionToken=${sessionToken}`
);
const data = await settingsResponse.json();
const openaiApiKey = data.settings.openaiApiKey; // Student's decrypted key

// 2. Fallback to instructor's key if student hasn't configured theirs
if (!openaiApiKey) {
  openaiApiKey = process.env.OPENAI_API_KEY;
  console.log('Using instructor key as fallback');
} else {
  console.log('✅ Using student\'s OpenAI API key');
}

// 3. Initialize OpenAI client with student's key
const openai = new OpenAI({ apiKey: openaiApiKey });
```

**Benefits:**
- ✅ Each student billed for their own usage
- ✅ Students learn to manage API costs
- ✅ Separate rate limits per student
- ✅ Instructor key available as fallback for students who haven't configured yet
- ✅ Full transparency of costs

---

## Flow Diagram

```
┌──────────────┐
│   Student    │
│   Browser    │
└──────┬───────┘
       │
       │ 1. Makes voice call with sessionToken
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│          workshop-websocket.js (WebSocket Server)       │
│                                                          │
│  1. Receives sessionToken from call                     │
│  2. Calls /api/get-student-ai-settings?sessionToken=... │
│                                                          │
└──────────────────┬──────────────────────────────────────┘
                   │
                   │ 2. Fetch settings
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│     /api/get-student-ai-settings.js (API Endpoint)      │
│                                                          │
│  1. Queries student_configs table                       │
│  2. Retrieves encrypted openai_api_key                  │
│  3. Calls decryptApiKey() to decrypt                    │
│  4. Returns decrypted key + settings                    │
│                                                          │
└──────────────────┬──────────────────────────────────────┘
                   │
                   │ 3. Returns { openaiApiKey, systemPrompt, ... }
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│          workshop-websocket.js (continued)              │
│                                                          │
│  1. Receives student's decrypted OpenAI key             │
│  2. Initializes OpenAI client with student's key        │
│  3. Handles conversation using student's key            │
│                                                          │
└──────────────────┬──────────────────────────────────────┘
                   │
                   │ 4. OpenAI API calls
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│              OpenAI API (External Service)              │
│                                                          │
│  - Student is billed for API usage                      │
│  - Student's rate limits apply                          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Files Modified

### 1. `/api/get-student-ai-settings.js`

**Changes:**
- ✅ Added `decryptApiKey` import from encryption library
- ✅ Added `openai_api_key` to SELECT query
- ✅ Decrypts OpenAI key before returning
- ✅ Returns decrypted key in `settings.openaiApiKey` field
- ✅ Handles missing keys gracefully with error messages

**Key Code:**
```javascript
import { decryptApiKey } from './_lib/encryption.js';

// Query includes openai_api_key
const result = await sql`
  SELECT openai_api_key, system_prompt, ivr_greeting, selected_voice, tools
  FROM student_configs
  WHERE session_token = ${sessionToken}
`;

// Decrypt before returning
let decryptedApiKey = null;
if (config.openai_api_key) {
  decryptedApiKey = decryptApiKey(config.openai_api_key);
  console.log('🔓 OpenAI API key decrypted');
}

return res.json({
  settings: {
    openaiApiKey: decryptedApiKey, // Decrypted key
    systemPrompt: config.system_prompt,
    // ...
  }
});
```

---

### 2. `/api/workshop-websocket.js`

**Changes:**
- ✅ Removed hardcoded `process.env.OPENAI_API_KEY` at handler entry
- ✅ Retrieves student's OpenAI key from `/api/get-student-ai-settings`
- ✅ Fallback to instructor's key if student hasn't configured theirs
- ✅ Logs which key is being used (student vs instructor)
- ✅ Error handling if no key available

**Key Code:**
```javascript
async function handleWebSocket(ws, sessionToken, sessionId) {
  let openaiApiKey = null;

  if (sessionToken) {
    // Fetch student settings (includes decrypted OpenAI key)
    const settingsResponse = await fetch(
      `/api/get-student-ai-settings?sessionToken=${sessionToken}`
    );
    const data = await settingsResponse.json();
    openaiApiKey = data.settings.openaiApiKey;
  }

  // Fallback to instructor's key if needed
  if (!openaiApiKey) {
    openaiApiKey = process.env.OPENAI_API_KEY;
    console.log('Using instructor\'s OpenAI API key (fallback)');
  } else {
    console.log('✅ Using student\'s OpenAI API key');
  }

  if (!openaiApiKey) {
    ws.send(JSON.stringify({
      type: 'error',
      error: 'No OpenAI API key configured'
    }));
    ws.close();
    return;
  }

  // Initialize OpenAI with student's key
  const openai = new OpenAI({ apiKey: openaiApiKey });
}
```

---

## Security Considerations

### Encryption at Rest
- OpenAI keys are **encrypted in the database** using AES-256-GCM
- Requires `ENCRYPTION_KEY` environment variable (64 hex characters)
- Keys decrypted **only when needed** by authorized endpoints

### Decryption Flow
```
Database (Encrypted)  →  /api/get-student-ai-settings  →  WebSocket Server
  AES-256-GCM              decryptApiKey()                 Uses plaintext key
  {iv}:{authTag}:{ct}      ↓                               (in memory only)
                        Plaintext key
```

### Access Control
- `/api/get-student-ai-settings` should be **restricted to server-side calls only**
- In production, add authorization checks (e.g., API key, JWT)
- Never expose decrypted keys to client-side JavaScript

---

## Student Experience

### Step 1: Setup OpenAI Connection
```
1. Student enters OpenAI API key in browser
2. Frontend sends key to /api/student-config-save
3. Server encrypts key and stores in database
4. Student sees: "✅ OpenAI connected"
```

### Step 6+: Making Test Calls
```
1. Student clicks "Make a Test Call"
2. Browser initiates WebSocket connection with sessionToken
3. WebSocket server:
   a. Fetches student's settings (includes decrypted key)
   b. Initializes OpenAI with student's key
   c. Handles conversation using student's key
4. Student's OpenAI account is billed for usage
```

---

## Instructor Setup

### Environment Variables Required

**Production (Vercel):**
```bash
ENCRYPTION_KEY=<64 hex characters>          # For encrypting/decrypting keys
OPENAI_API_KEY=<instructor's key>           # Fallback for students without keys
```

**Set via Vercel CLI:**
```bash
# Generate encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Add to Vercel
vercel env add ENCRYPTION_KEY production
vercel env add OPENAI_API_KEY production
```

---

## Migration from Old Approach

If you have an existing workshop deployment using the old approach (single instructor key):

### 1. Generate Encryption Key
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Add to Environment
```bash
vercel env add ENCRYPTION_KEY production
# Paste the 64-character hex string
```

### 3. Deploy Updated Code
```bash
git add api/workshop-websocket.js api/get-student-ai-settings.js
git commit -m "Use student OpenAI keys in WebSocket server"
vercel --prod
```

### 4. Notify Students
Students need to:
1. Go to Step 1: Setup OpenAI Connection
2. Enter their OpenAI API key
3. Click "Connect to OpenAI"
4. Key is encrypted and stored for their session

---

## Fallback Behavior

The system gracefully handles missing student keys:

| Scenario | Behavior |
|----------|----------|
| **Student has configured key** | ✅ Uses student's key, student is billed |
| **Student hasn't configured key** | ⚠️ Uses instructor's key (fallback), instructor is billed |
| **No key available (neither)** | ❌ Error sent to client, WebSocket closes |

**Logs:**
```
✅ Using student's OpenAI API key
⚠️ Using instructor's OpenAI API key (student key not configured)
❌ No OpenAI API key available (neither student nor instructor key found)
```

---

## Testing

### Test Student Key Usage
```bash
# 1. Configure student key
curl -X POST https://your-app.vercel.app/api/student-config-save \
  -H "Content-Type: application/json" \
  -d '{
    "sessionToken": "test_session_123",
    "studentEmail": "test@example.com",
    "openaiApiKey": "sk-proj-test-key-123..."
  }'

# 2. Verify key is encrypted in database
psql $POSTGRES_URL -c "SELECT session_token, openai_api_key FROM student_configs WHERE session_token = 'test_session_123';"
# Should see: {iv}:{authTag}:{ciphertext} (NOT plaintext sk-proj-...)

# 3. Test WebSocket retrieves and uses key
# Make a test call and check Vercel logs for:
# "✅ Using student's OpenAI API key"
```

### Test Fallback Behavior
```bash
# 1. Create session without OpenAI key
curl -X POST https://your-app.vercel.app/api/student-config-save \
  -H "Content-Type: application/json" \
  -d '{
    "sessionToken": "test_session_no_key",
    "studentEmail": "test@example.com"
  }'

# 2. Make test call and check logs for:
# "Using instructor's OpenAI API key (student key not configured)"
```

---

## Troubleshooting

### Error: "No OpenAI API key available"

**Cause:** Neither student nor instructor key is configured

**Fix:**
1. Student: Configure key in Step 1
2. Instructor: Set `OPENAI_API_KEY` environment variable

---

### Error: "Failed to decrypt API key"

**Cause:** `ENCRYPTION_KEY` environment variable not set or incorrect

**Fix:**
```bash
# Verify ENCRYPTION_KEY is set
vercel env pull .env.production
cat .env.production | grep ENCRYPTION_KEY

# If missing, add it
vercel env add ENCRYPTION_KEY production
```

---

### Student billed but says they didn't configure key

**Cause:** Student configured key in Step 1, key is being used

**Verify:**
```bash
# Check if student has key in database
curl "https://your-app.vercel.app/api/get-student-ai-settings?sessionToken=<student_token>"

# Should return: "openaiApiKey": "sk-proj-..." (decrypted)
```

---

## Cost Transparency

### For Students
- Each student is billed for their own OpenAI usage
- Students can monitor usage in OpenAI dashboard
- Encourages responsible API usage during workshop

### For Instructors
- Instructor's key only used as fallback
- Clear separation of costs
- Can track which students are using fallback key via logs

---

## Summary

✅ **Students use their own OpenAI keys**
✅ **Keys encrypted at rest (AES-256-GCM)**
✅ **Auto-decrypted when needed by WebSocket server**
✅ **Instructor's key available as fallback**
✅ **Cost transparency and individual billing**
✅ **Backward compatible with existing sessions**

---

**Last Updated:** January 23, 2025
**Version:** 2.0.0
**Related Docs:**
- `/CREDENTIAL-SECURITY.md` - Full security architecture
- `/ENCRYPTION-SETUP.md` - Encryption setup guide
- `/api/_lib/encryption.js` - Encryption utilities
