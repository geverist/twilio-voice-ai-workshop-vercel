# Credential Security Architecture

This document explains how credentials are handled in the Twilio Voice AI Workshop to ensure security while maintaining usability.

---

## 🔐 Security Principles

### 1. **Twilio Credentials: Client-Side Only**
**Storage**: localStorage (browser)
**Transmission**: Never sent to server
**Reason**: Prevents server from storing Twilio credentials, reducing security risk

### 2. **OpenAI API Keys: Server-Side Encrypted**
**Storage**: PostgreSQL database (encrypted)
**Transmission**: HTTPS only
**Encryption**: AES-256-GCM with random IV per encryption

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    WORKSHOP ARCHITECTURE                    │
└─────────────────────────────────────────────────────────────┘

┌─────────────┐           ┌──────────────┐          ┌──────────────┐
│   Browser   │           │   Vercel     │          │  PostgreSQL  │
│  (Student)  │           │  API Routes  │          │   Database   │
└─────────────┘           └──────────────┘          └──────────────┘
       │                          │                         │
       │                          │                         │
       ▼                          ▼                         ▼
┌─────────────┐           ┌──────────────┐          ┌──────────────┐
│ localStorage│           │  Encryption  │          │  Encrypted   │
│             │           │    Layer     │          │  OpenAI Keys │
│ • Twilio    │──────────▶│              │─────────▶│              │
│   AccountSID│  (HTTPS)  │  AES-256-GCM │  (SSL)   │ student_     │
│ • AuthToken │           │  + Random IV │          │ configs      │
│ • (OpenAI)* │           │              │          │ table        │
└─────────────┘           └──────────────┘          └──────────────┘
  *Optional                      │                         │
   stored for                    │                         │
   convenience                   ▼                         ▼
                          ┌──────────────┐          ┌──────────────┐
                          │  Decryption  │          │  Encrypted   │
                          │    Layer     │◀─────────│  Data at     │
                          │              │  Retrieve │  Rest        │
                          └──────────────┘          └──────────────┘
                                 │
                                 ▼
                          ┌──────────────┐
                          │  WebSocket   │
                          │   Server     │
                          │              │
                          │  Uses        │
                          │  decrypted   │
                          │  OpenAI key  │
                          └──────────────┘
```

---

## Credential Flows

### Flow 1: Twilio Credentials (Client-Side Only)

```
1. Student enters Twilio credentials in browser
   ↓
2. Saved to localStorage ONLY
   ↓
3. JavaScript uses credentials to make API calls directly to Twilio
   ↓
4. Server NEVER sees or stores Twilio credentials
```

**Code Location**: `/public/index.html` lines 3122-3186 (`connectTwilio()`)

**localStorage Keys**:
- `twilioAccountSid`
- `twilioAuthToken`
- `twilioCredentials` (JSON object)

**Why This is Secure**:
- ✅ Server has no access to Twilio credentials
- ✅ Credentials only exist in student's browser
- ✅ If database is compromised, Twilio credentials are safe
- ✅ Students can clear credentials by clearing browser storage

---

### Flow 2: OpenAI API Keys (Encrypted Server-Side)

```
1. Student enters OpenAI API key in browser
   ↓
2. Key sent to /api/student-config-save via HTTPS
   ↓
3. Server encrypts key using AES-256-GCM
   ↓
4. Encrypted key stored in PostgreSQL
   ↓
5. When needed:
   a. WebSocket server retrieves encrypted key
   b. Decrypts key using ENCRYPTION_KEY env var
   c. Uses decrypted key to call OpenAI API
   d. Key never logged or exposed
```

**Code Locations**:
- Encryption: `/api/_lib/encryption.js`
- Save: `/api/student-config-save.js` lines 112-125
- Retrieve: `/api/student-config-get.js` lines 81-93

**Database Column**: `student_configs.openai_api_key` (TEXT, stores base64-encoded encrypted data)

**Encryption Format**: `{iv}:{authTag}:{ciphertext}` (all base64)

**Why This is Necessary**:
- ❗ WebSocket server needs OpenAI key to make API calls
- ❗ Server-side encryption protects keys in database
- ✅ If database is compromised, keys are unusable without ENCRYPTION_KEY
- ✅ Each encryption uses random IV (no deterministic encryption)

---

## Encryption Implementation

### Algorithm: AES-256-GCM

**Properties**:
- **Block Cipher**: AES (Advanced Encryption Standard)
- **Key Size**: 256 bits (32 bytes)
- **Mode**: GCM (Galois/Counter Mode)
- **IV Length**: 128 bits (16 bytes, randomly generated)
- **Auth Tag**: 128 bits (16 bytes, for authentication)

**Security Features**:
- ✅ Authenticated encryption (detects tampering)
- ✅ Random IV per encryption (no pattern analysis)
- ✅ Industry-standard algorithm (NIST approved)
- ✅ Protection against padding oracle attacks

### Encryption Process

```javascript
// 1. Get encryption key from environment
const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex'); // 32 bytes

// 2. Generate random IV
const iv = crypto.randomBytes(16); // 128 bits

// 3. Create cipher
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

// 4. Encrypt plaintext
let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
ciphertext += cipher.final('base64');

// 5. Get authentication tag
const authTag = cipher.getAuthTag(); // 128 bits

// 6. Format: iv:authTag:ciphertext (all base64)
const encrypted = `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext}`;
```

### Decryption Process

```javascript
// 1. Parse encrypted data
const [ivBase64, authTagBase64, ciphertext] = encrypted.split(':');
const iv = Buffer.from(ivBase64, 'base64');
const authTag = Buffer.from(authTagBase64, 'base64');

// 2. Create decipher
const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
decipher.setAuthTag(authTag);

// 3. Decrypt
let plaintext = decipher.update(ciphertext, 'base64', 'utf8');
plaintext += decipher.final('utf8');
```

---

## Environment Setup

### Required Environment Variable

```bash
ENCRYPTION_KEY=<64 hex characters>
```

### Generate Encryption Key

```bash
# Option 1: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Option 2: OpenSSL
openssl rand -hex 32

# Option 3: Python
python3 -c "import secrets; print(secrets.token_hex(32))"
```

**Example Output** (DO NOT USE THIS KEY):
```
a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
```

### Setting Environment Variable

**Vercel**:
```bash
vercel env add ENCRYPTION_KEY production
# Paste generated 64-character hex string
```

**Local Development** (.env.local):
```
ENCRYPTION_KEY=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
```

**Important**:
- 🔴 **NEVER commit ENCRYPTION_KEY to git**
- 🔴 **Use different keys for dev/staging/production**
- 🔴 **Store key securely (password manager, secrets vault)**
- 🔴 **Rotating keys requires re-encrypting all existing data**

---

## API Endpoints

### Save Config (Encrypts Key)

**Endpoint**: `POST /api/student-config-save`

**Request**:
```json
{
  "sessionToken": "ws_123...",
  "studentEmail": "student@example.com",
  "openaiApiKey": "sk-proj-...",
  "systemPrompt": "...",
  "tools": [],
  "voiceSettings": {}
}
```

**Process**:
1. Validates sessionToken and inputs
2. Encrypts `openaiApiKey` using AES-256-GCM
3. Stores encrypted key in database
4. Logs: `🔐 OpenAI API key encrypted for session: ws_123...`

**Response**:
```json
{
  "success": true,
  "message": "Configuration saved",
  "websocketUrl": "wss://..."
}
```

---

### Get Config (Decrypts Key)

**Endpoint**: `GET /api/student-config-get?sessionToken=ws_123...`

**Process**:
1. Retrieves encrypted config from database
2. Decrypts `openaiApiKey` using ENCRYPTION_KEY
3. Returns decrypted key to authorized caller
4. Logs: `🔓 OpenAI API key decrypted for session: ws_123...`

**Response**:
```json
{
  "success": true,
  "config": {
    "sessionToken": "ws_123...",
    "studentName": "John Doe",
    "openaiApiKey": "sk-proj-...",  ← Decrypted
    "systemPrompt": "...",
    "tools": [],
    "voiceSettings": {}
  }
}
```

**Security Note**: This endpoint should be secured with proper authorization in production.

---

## Workshop Usage

### During Workshop (Shared WebSocket Server)

The workshop uses a **shared WebSocket server** that retrieves and uses the **student's OpenAI API key**:

```javascript
// api/workshop-websocket.js - Retrieves student's key from database
const settingsResponse = await fetch('/api/get-student-ai-settings?sessionToken=...');
const openaiApiKey = data.settings.openaiApiKey; // Student's decrypted key

// Fallback to instructor's key if student hasn't configured their own yet
if (!openaiApiKey) {
  openaiApiKey = process.env.OPENAI_API_KEY; // Instructor's key as fallback
}
```

**How It Works**:
- ✅ Students configure their OpenAI API key in Step 1
- ✅ Key is encrypted and stored in database
- ✅ WebSocket server retrieves and decrypts key for each student session
- ✅ Each student is billed for their own OpenAI usage
- ✅ Instructor's key available as fallback for students who haven't configured their key yet

**Security Benefits**:
- 🔐 Keys encrypted at rest in database (AES-256-GCM)
- 🔓 Auto-decrypted when needed by WebSocket server
- 📊 Each student responsible for their own API costs
- 🔒 Instructor's key protected as environment variable

---

### After Workshop (Student's Own Server)

When students deploy their own WebSocket servers:

```javascript
// Student's deployed server.js
const studentConfig = await fetch('/api/student-config-get?sessionToken=ws_123...');
const openaiApiKey = studentConfig.config.openaiApiKey; // Decrypted by API

const openai = new OpenAI({ apiKey: openaiApiKey }); // Student's key
```

**Flow**:
1. Student deploys WebSocket server to Railway/Render
2. Server retrieves encrypted config from database
3. API decrypts OpenAI key and returns to server
4. Server uses decrypted key to call OpenAI
5. Student is billed for their own OpenAI usage

---

## Security Best Practices

### ✅ Do

- ✅ Generate strong 32-byte (256-bit) encryption keys
- ✅ Use different ENCRYPTION_KEY for dev/staging/production
- ✅ Store ENCRYPTION_KEY in secure secrets manager
- ✅ Rotate encryption keys periodically (with re-encryption migration)
- ✅ Log encryption/decryption events (without logging keys)
- ✅ Use HTTPS for all API calls
- ✅ Validate sessionToken before returning configs
- ✅ Add rate limiting to config endpoints

### ❌ Don't

- ❌ Commit ENCRYPTION_KEY to version control
- ❌ Log plaintext API keys
- ❌ Share ENCRYPTION_KEY between environments
- ❌ Use weak encryption keys (< 256 bits)
- ❌ Disable SSL certificate validation
- ❌ Store decrypted keys in memory longer than needed
- ❌ Return decrypted keys to unauthorized callers
- ❌ Use same IV for multiple encryptions (always random)

---

## Migration from Unencrypted Data

If you have existing unencrypted OpenAI keys in the database:

### Migration Script

```javascript
// api/admin-encrypt-legacy-keys.js
import postgres from 'postgres';
import { encryptApiKey, isEncrypted } from './_lib/encryption.js';

const sql = postgres(process.env.POSTGRES_URL, { ssl: 'require', max: 1 });

export default async function handler(req, res) {
  // Authentication check
  if (req.body.adminPassword !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Get all configs
  const configs = await sql`SELECT session_token, openai_api_key FROM student_configs`;

  let encrypted = 0;
  let skipped = 0;

  for (const config of configs) {
    if (!config.openai_api_key) {
      skipped++;
      continue;
    }

    // Skip if already encrypted
    if (isEncrypted(config.openai_api_key)) {
      skipped++;
      continue;
    }

    // Encrypt and update
    const encryptedKey = encryptApiKey(config.openai_api_key);
    await sql`
      UPDATE student_configs
      SET openai_api_key = ${encryptedKey}
      WHERE session_token = ${config.session_token}
    `;
    encrypted++;
  }

  return res.json({
    success: true,
    encrypted,
    skipped,
    message: `Encrypted ${encrypted} keys, skipped ${skipped}`
  });
}
```

**Run**:
```bash
curl -X POST https://your-app.vercel.app/api/admin-encrypt-legacy-keys \
  -H "Content-Type: application/json" \
  -d '{"adminPassword": "YOUR_ADMIN_PASSWORD"}'
```

---

## Troubleshooting

### Error: "ENCRYPTION_KEY environment variable not set"

**Cause**: Missing or incorrectly named environment variable

**Fix**:
```bash
# Vercel
vercel env add ENCRYPTION_KEY production

# Local (.env.local)
ENCRYPTION_KEY=<64 hex characters>
```

---

### Error: "Failed to decrypt data"

**Causes**:
1. ENCRYPTION_KEY changed (keys encrypted with different key)
2. Corrupted encrypted data in database
3. Wrong encryption key for environment

**Fix**:
- Restore original ENCRYPTION_KEY
- Re-encrypt data if key was intentionally rotated
- Check database for corruption

---

### Error: "ENCRYPTION_KEY must be 64 hex characters"

**Cause**: Invalid key format or length

**Fix**:
```bash
# Generate correct 64-character hex key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Summary

| Credential Type | Storage Location | Encryption | Transmission | Access |
|----------------|------------------|------------|--------------|--------|
| **Twilio AccountSID** | localStorage | ❌ None | ❌ Never sent | Client only |
| **Twilio AuthToken** | localStorage | ❌ None | ❌ Never sent | Client only |
| **OpenAI API Key** | PostgreSQL | ✅ AES-256-GCM | ✅ HTTPS | Server + authorized clients |

**Key Takeaway**: Twilio credentials never leave the browser, OpenAI keys are encrypted at rest.

---

## References

- [NIST SP 800-38D (GCM)](https://csrc.nist.gov/publications/detail/sp/800-38d/final)
- [Node.js Crypto Module](https://nodejs.org/api/crypto.html)
- [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- `/api/_lib/encryption.js` - Implementation
- `/api/student-config-save.js` - Encryption usage
- `/api/student-config-get.js` - Decryption usage
