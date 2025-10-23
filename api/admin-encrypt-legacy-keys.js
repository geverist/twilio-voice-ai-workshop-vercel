/**
 * Admin Migration: Encrypt Legacy Unencrypted OpenAI API Keys
 *
 * This migration encrypts existing plaintext OpenAI API keys in the database
 * using AES-256-GCM encryption.
 *
 * POST /api/admin-encrypt-legacy-keys
 * Body: {
 *   "adminPassword": "YOUR_ADMIN_PASSWORD"
 * }
 *
 * Response: {
 *   "success": true,
 *   "encrypted": 5,
 *   "skipped": 2,
 *   "message": "Encrypted 5 keys, skipped 2 (already encrypted or null)"
 * }
 */

import postgres from 'postgres';
import { applyCORS, handlePreflightRequest } from './_lib/cors.js';
import { encryptApiKey, isEncrypted } from './_lib/encryption.js';

const sql = postgres(process.env.POSTGRES_URL, {
  ssl: 'require',
  max: 1
});

export default async function handler(req, res) {
  applyCORS(req, res);

  if (handlePreflightRequest(req, res)) {
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.'
    });
  }

  try {
    const { adminPassword } = req.body;

    // Authentication
    const correctPassword = process.env.ADMIN_PASSWORD;

    if (!correctPassword) {
      return res.status(500).json({
        success: false,
        error: 'Admin password not configured in environment variables'
      });
    }

    if (!adminPassword || adminPassword !== correctPassword) {
      console.warn('⚠️ Unauthorized encryption migration attempt');
      return res.status(401).json({
        success: false,
        error: 'Invalid admin password'
      });
    }

    // Check if ENCRYPTION_KEY is set
    if (!process.env.ENCRYPTION_KEY) {
      return res.status(500).json({
        success: false,
        error: 'ENCRYPTION_KEY environment variable not set. Cannot encrypt keys.'
      });
    }

    console.log('🔐 Starting OpenAI API key encryption migration...');

    // Get all configs with OpenAI keys
    const configs = await sql`
      SELECT session_token, openai_api_key
      FROM student_configs
      WHERE openai_api_key IS NOT NULL
    `;

    let encrypted = 0;
    let skipped = 0;
    let errors = 0;
    const errorDetails = [];

    for (const config of configs) {
      try {
        // Skip if already encrypted
        if (isEncrypted(config.openai_api_key)) {
          console.log(`  ✓ Skipping ${config.session_token.substring(0, 8)}... (already encrypted)`);
          skipped++;
          continue;
        }

        // Encrypt the key
        const encryptedKey = encryptApiKey(config.openai_api_key);

        // Update database
        await sql`
          UPDATE student_configs
          SET openai_api_key = ${encryptedKey},
              updated_at = NOW()
          WHERE session_token = ${config.session_token}
        `;

        console.log(`  🔐 Encrypted key for session: ${config.session_token.substring(0, 8)}...`);
        encrypted++;

      } catch (error) {
        console.error(`  ❌ Error encrypting key for ${config.session_token.substring(0, 8)}:`, error.message);
        errors++;
        errorDetails.push({
          sessionToken: config.session_token.substring(0, 8) + '...',
          error: error.message
        });
      }
    }

    console.log('✅ Encryption migration completed');
    console.log(`   Total: ${configs.length}`);
    console.log(`   Encrypted: ${encrypted}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Errors: ${errors}`);

    return res.status(200).json({
      success: true,
      totalKeys: configs.length,
      encrypted,
      skipped,
      errors,
      errorDetails: errors > 0 ? errorDetails : undefined,
      message: `Migration complete: Encrypted ${encrypted} keys, skipped ${skipped} (already encrypted or null)${errors > 0 ? `, ${errors} errors` : ''}`
    });

  } catch (error) {
    console.error('Migration error:', error);
    return res.status(500).json({
      success: false,
      error: 'Migration failed',
      details: error.message
    });
  }
}
