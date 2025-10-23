/**
 * Get Student Configuration API
 *
 * Retrieves a student's full configuration by session token
 * Used by admin panel to load settings
 *
 * GET /api/student-config-get?sessionToken=xyz
 */

import postgres from 'postgres';
import { applyCORS, handlePreflightRequest } from './_lib/cors.js';
import { decryptApiKey } from './_lib/encryption.js';

// Create postgres connection
const sql = postgres(process.env.POSTGRES_URL, {
  ssl: 'require',
  max: 1
});

export default async function handler(req, res) {
  // Apply CORS
  applyCORS(req, res);

  // Handle preflight
  if (handlePreflightRequest(req, res)) {
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { sessionToken } = req.query;

    // Validation
    if (!sessionToken) {
      return res.status(400).json({
        success: false,
        error: 'sessionToken query parameter is required'
      });
    }

    console.log(`📖 Fetching config for session: ${sessionToken.substring(0, 20)}...`);

    // Get student configuration
    const configs = await sql`
      SELECT
        session_token,
        student_name,
        openai_api_key,
        system_prompt,
        tools,
        voice_settings,
        use_case_description,
        call_direction,
        ivr_greeting,
        tts_provider,
        selected_voice,
        selected_phone_number,
        websocket_url,
        codespace_url,
        github_repo_url,
        railway_url,
        created_at,
        updated_at
      FROM student_configs
      WHERE session_token = ${sessionToken}
      LIMIT 1
    `;

    if (configs.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Configuration not found for this session token'
      });
    }

    const config = configs[0];

    // Decrypt OpenAI API key before returning (if present)
    let decryptedApiKey = null;
    if (config.openai_api_key) {
      try {
        decryptedApiKey = decryptApiKey(config.openai_api_key);
        console.log(`🔓 OpenAI API key decrypted for session: ${sessionToken.substring(0, 8)}...`);
      } catch (error) {
        console.error('Failed to decrypt API key:', error.message);
        // Return error but allow workshop to continue (key might be legacy unencrypted)
        decryptedApiKey = config.openai_api_key;
        console.warn('⚠️  Returning unencrypted key (legacy data or decryption failed)');
      }
    }

    console.log(`✅ Config retrieved for: ${config.student_name || 'Unknown'}`);

    return res.status(200).json({
      success: true,
      config: {
        sessionToken: config.session_token,
        studentName: config.student_name,
        openaiApiKey: decryptedApiKey,
        systemPrompt: config.system_prompt,
        tools: config.tools || [],
        voiceSettings: config.voice_settings || {},
        useCaseDescription: config.use_case_description,
        callDirection: config.call_direction,
        ivrGreeting: config.ivr_greeting,
        ttsProvider: config.tts_provider,
        selectedVoice: config.selected_voice,
        selectedPhoneNumber: config.selected_phone_number,
        websocketUrl: config.websocket_url,
        codespaceUrl: config.codespace_url,
        githubRepoUrl: config.github_repo_url,
        railwayUrl: config.railway_url,
        createdAt: config.created_at,
        updatedAt: config.updated_at
      }
    });

  } catch (error) {
    console.error('Get config error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve configuration'
    });
  }
}
