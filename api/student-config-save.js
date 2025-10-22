/**
 * Save Student Configuration API
 *
 * Saves student's AI configuration (system prompt, tools, etc.) to Vercel Postgres.
 * This config is used by the shared WebSocket server to handle their calls.
 */

import postgres from 'postgres';
import { applyCORS, handlePreflightRequest } from './_lib/cors.js';
// import { applyRateLimit } from './_lib/ratelimit.js'; // Temporarily disabled - causing function crashes
// import {
//   validateRequired,
//   validateString,
//   handleValidationError
// } from './_lib/validation.js'; // Temporarily disabled - causing function crashes

// Create postgres connection (same pattern as track-student-progress.js)
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

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // TODO: Re-enable rate limiting once Upstash is configured
  // const allowed = await applyRateLimit(req, res);
  // if (!allowed) {
  //   return;
  // }

  // Check if Postgres is configured
  if (!process.env.POSTGRES_URL) {
    return res.status(500).json({
      success: false,
      error: 'Database not configured. Please set POSTGRES_URL in environment variables.'
    });
  }

  try {
    const {
      sessionToken,
      studentName,
      openaiApiKey,
      systemPrompt,
      tools,
      voiceSettings,
      useCaseDescription,
      callDirection,
      ivrGreeting,
      ttsProvider,
      selectedVoice,
      selectedPhoneNumber,
      websocketUrl,
      codespaceUrl,
      githubRepoUrl,
      railwayUrl
    } = req.body;

    // Input validation (simplified - validation library disabled)
    if (!sessionToken || sessionToken.length < 10 || sessionToken.length > 200) {
      return res.status(400).json({
        success: false,
        error: 'Invalid sessionToken: must be between 10 and 200 characters'
      });
    }

    if (systemPrompt && systemPrompt.length > 5000) {
      return res.status(400).json({
        success: false,
        error: 'systemPrompt too long: maximum 5000 characters'
      });
    }

    console.log(`💾 Saving config for session: ${sessionToken.substring(0, 8)}...`);

    // Ensure table exists with all columns
    await sql`
      CREATE TABLE IF NOT EXISTS student_configs (
        session_token TEXT PRIMARY KEY,
        student_name TEXT,
        openai_api_key TEXT,
        system_prompt TEXT,
        tools JSONB DEFAULT '[]',
        voice_settings JSONB DEFAULT '{}',
        use_case_description TEXT,
        call_direction TEXT,
        ivr_greeting TEXT,
        tts_provider TEXT,
        selected_voice TEXT,
        selected_phone_number TEXT,
        websocket_url TEXT,
        codespace_url TEXT,
        github_repo_url TEXT,
        railway_url TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // Insert or update student configuration
    await sql`
      INSERT INTO student_configs (
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
        updated_at
      ) VALUES (
        ${sessionToken},
        ${studentName || null},
        ${openaiApiKey || null},
        ${systemPrompt || null},
        ${JSON.stringify(tools || [])},
        ${JSON.stringify(voiceSettings || {})},
        ${useCaseDescription || null},
        ${callDirection || null},
        ${ivrGreeting || null},
        ${ttsProvider || null},
        ${selectedVoice || null},
        ${selectedPhoneNumber || null},
        ${websocketUrl || null},
        ${codespaceUrl || null},
        ${githubRepoUrl || null},
        ${railwayUrl || null},
        NOW()
      )
      ON CONFLICT (session_token)
      DO UPDATE SET
        student_name = EXCLUDED.student_name,
        openai_api_key = EXCLUDED.openai_api_key,
        system_prompt = EXCLUDED.system_prompt,
        tools = EXCLUDED.tools,
        voice_settings = EXCLUDED.voice_settings,
        use_case_description = EXCLUDED.use_case_description,
        call_direction = EXCLUDED.call_direction,
        ivr_greeting = EXCLUDED.ivr_greeting,
        tts_provider = EXCLUDED.tts_provider,
        selected_voice = EXCLUDED.selected_voice,
        selected_phone_number = EXCLUDED.selected_phone_number,
        websocket_url = EXCLUDED.websocket_url,
        codespace_url = EXCLUDED.codespace_url,
        github_repo_url = EXCLUDED.github_repo_url,
        railway_url = EXCLUDED.railway_url,
        updated_at = NOW()
    `;

    console.log(`✅ Config saved for session: ${sessionToken.substring(0, 8)}...`);

    // Generate WebSocket URL
    const domain = (process.env.RAILWAY_WEBSOCKET_DOMAIN || '').trim();
    const websocketUrl = `wss://${domain}/ws/${sessionToken}`;

    return res.status(200).json({
      success: true,
      message: 'Configuration saved',
      websocketUrl: websocketUrl
    });

  } catch (error) {
    console.error('Save config error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to save configuration'
    });
  }
}
