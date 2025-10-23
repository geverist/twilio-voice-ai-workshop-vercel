# OpenAI API Key Encryption Setup Guide

This guide walks you through setting up encryption for OpenAI API keys in the Twilio Voice AI Workshop.

---

## Why Encryption?

**Problem**: OpenAI API keys were stored in plaintext in the PostgreSQL database, creating a security risk if the database is compromised.

**Solution**: AES-256-GCM encryption with a secret encryption key stored only in environment variables.

**Benefits**:
- 🔐 Keys encrypted at rest in database
- 🔑 Decryption only possible with ENCRYPTION_KEY
- ✅ Transparent to workshop participants
- 🔄 Keys still usable throughout workshop (auto-decrypted when needed)

---

## Quick Start

### 1. Generate Encryption Key

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Output (example - DO NOT USE):
a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
```

**Important**: Save this key securely! Losing it means you cannot decrypt existing keys.

---

### 2. Add to Environment Variables

**Vercel (Production)**:
```bash
vercel env add ENCRYPTION_KEY production
# Paste the 64-character hex string when prompted
```

**Local Development** (`.env.local`):
```env
ENCRYPTION_KEY=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
```

**Railway/Render** (if hosting WebSocket server):
```bash
# Railway
railway variables set ENCRYPTION_KEY=a1b2c3d4e5f6789012345678901234567890abcdef123456...

# Render
# Add in dashboard: Settings → Environment → ENCRYPTION_KEY
```

---

### 3. Deploy Code Changes

```bash
# Commit encryption changes
git add api/_lib/encryption.js
git add api/student-config-save.js
git add api/student-config-get.js
git add api/admin-encrypt-legacy-keys.js
git add CREDENTIAL-SECURITY.md
git add ENCRYPTION-SETUP.md

git commit -m "Add AES-256-GCM encryption for OpenAI API keys"

# Deploy to Vercel
vercel --prod
```

---

### 4. Encrypt Existing Keys (If Any)

If you have existing plaintext keys in the database, run this migration:

```bash
curl -X POST https://your-workshop.vercel.app/api/admin-encrypt-legacy-keys \
  -H "Content-Type: application/json" \
  -d '{"adminPassword": "YOUR_ADMIN_PASSWORD"}'
```

**Expected Response**:
```json
{
  "success": true,
  "totalKeys": 7,
  "encrypted": 5,
  "skipped": 2,
  "errors": 0,
  "message": "Migration complete: Encrypted 5 keys, skipped 2 (already encrypted or null)"
}
```

---

## How It Works

### When Student Saves Config

```
1. Student enters OpenAI key in browser
   ↓
2. Frontend sends key to /api/student-config-save (HTTPS)
   ↓
3. Server encrypts key using AES-256-GCM
   Format: {iv}:{authTag}:{ciphertext} (base64)
   ↓
4. Encrypted key stored in database
   ✅ Key is now protected at rest
```

### When Key is Needed

```
1. WebSocket server needs key for AI call
   ↓
2. Calls /api/student-config-get?sessionToken=ws_123...
   ↓
3. Server retrieves encrypted key from database
   ↓
4. Server decrypts key using ENCRYPTION_KEY
   ↓
5. Returns decrypted key to authorized caller
   ↓
6. Key used to make OpenAI API call
   ✅ Key never logged or stored decrypted
```

---

## Usage Throughout Workshop

### Step 1: Student Enters Key

```javascript
// public/index.html - connectOpenAI()
async function connectOpenAI() {
  const apiKey = document.getElementById('openaiKey').value.trim();

  // Key sent to server for encryption and storage
  await fetch('/api/student-config-save', {
    method: 'POST',
    body: JSON.stringify({
      sessionToken,
      openaiApiKey: apiKey,  // Plaintext (sent over HTTPS)
      // ... other config
    })
  });
  // Server encrypts before storing
}
```

### Step 2: AI Content Generation

```javascript
// api/generate-use-case-content.js
// Student's key passed directly from frontend (not retrieved from DB)
const { openaiApiKey } = req.body;  // From frontend
await fetch('https://api.openai.com/v1/chat/completions', {
  headers: {
    'Authorization': `Bearer ${openaiApiKey}`
  }
});
```

**Note**: This endpoint receives the key from the frontend and uses it immediately without storing. The actual encryption happens in `student-config-save.js`.

### Step 3: WebSocket Server Usage

```javascript
// When student makes test call
const response = await fetch('/api/student-config-get?sessionToken=ws_123...');
const config = await response.json();

const openaiApiKey = config.config.openaiApiKey;  // Auto-decrypted by API
const openai = new OpenAI({ apiKey: openaiApiKey });
```

---

## Encryption Details

### Algorithm: AES-256-GCM

- **Cipher**: AES (Advanced Encryption Standard)
- **Key Size**: 256 bits (32 bytes / 64 hex chars)
- **Mode**: GCM (Galois/Counter Mode)
- **IV**: 128 bits (16 bytes, random per encryption)
- **Auth Tag**: 128 bits (16 bytes, for authentication)

### Security Properties

✅ **Authenticated Encryption**: Detects tampering
✅ **Random IV**: Different ciphertext each time
✅ **Industry Standard**: NIST approved
✅ **No Padding Oracle**: GCM mode immune

### Encrypted Data Format

```
[IV (base64)]:[Auth Tag (base64)]:[Ciphertext (base64)]

Example:
xKj3P9f2Nw1mL8qR5tY7Zw==:hN9f2K4mP8qR5tY7ZwxKj3==:eW91ci1lbmNyeXB0ZWQta2V5...
```

---

## Verification

### Check Environment Variable

```bash
# Vercel
vercel env pull .env.production
cat .env.production | grep ENCRYPTION_KEY

# Local
cat .env.local | grep ENCRYPTION_KEY
```

**Expected**: 64 hex characters

---

### Test Encryption

```bash
# Save a test config
curl -X POST https://your-workshop.vercel.app/api/student-config-save \
  -H "Content-Type: application/json" \
  -d '{
    "sessionToken": "test_session_123",
    "studentEmail": "test@example.com",
    "openaiApiKey": "sk-test-1234567890abcdefghijklmnopqrstuvwxyz"
  }'
```

**Check Database**:
```sql
SELECT session_token, openai_api_key
FROM student_configs
WHERE session_token = 'test_session_123';
```

**Expected**: Key should look like: `xKj3P9f2Nw1mL8qR5tY7Zw==:hN9f2K4mP8...`
**Not**: `sk-test-1234567890...`

---

### Test Decryption

```bash
# Retrieve config
curl "https://your-workshop.vercel.app/api/student-config-get?sessionToken=test_session_123"
```

**Expected Response**:
```json
{
  "success": true,
  "config": {
    "sessionToken": "test_session_123",
    "openaiApiKey": "sk-test-1234567890abcdefghijklmnopqrstuvwxyz"
  }
}
```

**Check Logs** (Vercel dashboard):
```
🔐 OpenAI API key encrypted for session: test_ses...
🔓 OpenAI API key decrypted for session: test_ses...
```

---

## Troubleshooting

### Error: "ENCRYPTION_KEY environment variable not set"

**Cause**: Environment variable missing or misspelled

**Fix**:
```bash
# Check if variable exists
vercel env ls

# Add if missing
vercel env add ENCRYPTION_KEY production
```

---

### Error: "Failed to decrypt data"

**Cause**: ENCRYPTION_KEY changed or corrupted data

**Fix**:
1. Verify ENCRYPTION_KEY matches the key used for encryption
2. Check database for data corruption
3. If key was intentionally changed, re-encrypt all data:

```bash
# 1. Restore original ENCRYPTION_KEY
# 2. Retrieve and backup all keys
# 3. Update ENCRYPTION_KEY to new value
# 4. Re-encrypt all keys
```

---

### Error: "ENCRYPTION_KEY must be 64 hex characters"

**Cause**: Invalid key format

**Fix**:
```bash
# Generate correct key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Output: 64 hex characters (0-9, a-f)
```

---

### Legacy Keys Not Encrypted

**Symptom**: Some keys are plaintext (start with `sk-`)

**Fix**: Run migration script
```bash
curl -X POST https://your-workshop.vercel.app/api/admin-encrypt-legacy-keys \
  -H "Content-Type: application/json" \
  -d '{"adminPassword": "YOUR_ADMIN_PASSWORD"}'
```

---

## Security Best Practices

### ✅ DO

- ✅ Use strong 256-bit encryption keys
- ✅ Store ENCRYPTION_KEY in secure secrets manager
- ✅ Use different keys for dev/staging/production
- ✅ Backup ENCRYPTION_KEY securely
- ✅ Rotate keys periodically (with re-encryption)
- ✅ Use HTTPS for all API calls
- ✅ Log encryption/decryption events (not keys)
- ✅ Validate sessionToken before returning configs

### ❌ DON'T

- ❌ Commit ENCRYPTION_KEY to git
- ❌ Log plaintext API keys
- ❌ Share keys between environments
- ❌ Use weak encryption keys
- ❌ Disable SSL certificate validation
- ❌ Store decrypted keys longer than needed
- ❌ Return keys to unauthorized callers
- ❌ Reuse IVs (always random)

---

## Key Rotation

If you need to rotate the ENCRYPTION_KEY:

### 1. Backup Current Key

```bash
# Save current ENCRYPTION_KEY somewhere secure
echo $ENCRYPTION_KEY > old-key-backup.txt
```

### 2. Decrypt All Keys with Old Key

```bash
# Custom script or manual export
node scripts/export-decrypted-keys.js > keys-backup.json
```

### 3. Generate New Key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Update Environment Variable

```bash
vercel env rm ENCRYPTION_KEY production
vercel env add ENCRYPTION_KEY production
# Paste new key
```

### 5. Re-encrypt All Keys

```bash
# Custom script to re-encrypt with new key
node scripts/re-encrypt-all-keys.js keys-backup.json
```

---

## Files Modified

- ✅ `/api/_lib/encryption.js` - Encryption utilities (NEW)
- ✅ `/api/student-config-save.js` - Encrypts before saving
- ✅ `/api/student-config-get.js` - Decrypts before returning
- ✅ `/api/admin-encrypt-legacy-keys.js` - Migration script (NEW)
- ✅ `/CREDENTIAL-SECURITY.md` - Full documentation (NEW)
- ✅ `/ENCRYPTION-SETUP.md` - This guide (NEW)

---

## Next Steps

1. ✅ Generate ENCRYPTION_KEY
2. ✅ Add to environment variables (Vercel, Railway, etc.)
3. ✅ Deploy code changes
4. ✅ Run migration to encrypt existing keys
5. ✅ Test encryption/decryption
6. ✅ Verify workshop flow still works
7. ✅ Monitor logs for encryption events

---

## Support

For questions or issues:

1. Check `/CREDENTIAL-SECURITY.md` for architecture details
2. Review encryption logs in Vercel dashboard
3. Test encryption/decryption manually
4. Verify ENCRYPTION_KEY is set correctly

---

**Implemented by**: Claude Code
**Date**: January 23, 2025
**Version**: 1.0.0
