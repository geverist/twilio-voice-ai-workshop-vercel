/**
 * Save Student Configuration API
 *
 * Saves student's AI configuration (system prompt, tools, etc.) to Vercel Postgres.
 * This config is used by the shared WebSocket server to handle their calls.
 */

export const config = {
  runtime: 'nodejs'
};

import postgres from 'postgres';
import { applyCORS, handlePreflightRequest } from './_lib/cors.js';
import { encryptApiKey } from './_lib/encryption.js';
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
      studentEmail,
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
      railwayUrl,
      // State tracking fields
      currentStep,
      twilioConnected,
      openaiConnected,
      callDirectionChosen,
      servicesReady,
      step4CodeValidated,
      step4Committed,
      step4Deployed,
      step5CodeValidated,
      step5Committed,
      step5Deployed,
      step6CodeValidated,
      step6Committed,
      step6Deployed,
      systemPromptSaved,
      step7Committed,
      step7Deployed,
      toolsConfigured,
      step8CodeValidated,
      step8Committed,
      step8Deployed,
      projectDeployed
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

    // Encrypt OpenAI API key before storing (if provided)
    let encryptedApiKey = null;
    if (openaiApiKey) {
      try {
        encryptedApiKey = encryptApiKey(openaiApiKey);
        console.log(`🔐 OpenAI API key encrypted for session: ${sessionToken.substring(0, 8)}...`);
      } catch (error) {
        console.error('Failed to encrypt API key:', error.message);
        return res.status(500).json({
          success: false,
          error: 'Failed to encrypt API key. Check ENCRYPTION_KEY environment variable.'
        });
      }
    }

    // Ensure table exists with all columns including state tracking
    await sql`
      CREATE TABLE IF NOT EXISTS student_configs (
        session_token TEXT PRIMARY KEY,
        student_name TEXT,
        student_email TEXT,
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
        -- State tracking columns
        current_step INTEGER DEFAULT 0,
        twilio_connected BOOLEAN DEFAULT false,
        openai_connected BOOLEAN DEFAULT false,
        call_direction_chosen BOOLEAN DEFAULT false,
        services_ready BOOLEAN DEFAULT false,
        step4_code_validated BOOLEAN DEFAULT false,
        step4_committed BOOLEAN DEFAULT false,
        step4_deployed BOOLEAN DEFAULT false,
        step5_code_validated BOOLEAN DEFAULT false,
        step5_committed BOOLEAN DEFAULT false,
        step5_deployed BOOLEAN DEFAULT false,
        step6_code_validated BOOLEAN DEFAULT false,
        step6_committed BOOLEAN DEFAULT false,
        step6_deployed BOOLEAN DEFAULT false,
        system_prompt_saved BOOLEAN DEFAULT false,
        step7_committed BOOLEAN DEFAULT false,
        step7_deployed BOOLEAN DEFAULT false,
        tools_configured BOOLEAN DEFAULT false,
        step8_code_validated BOOLEAN DEFAULT false,
        step8_committed BOOLEAN DEFAULT false,
        step8_deployed BOOLEAN DEFAULT false,
        project_deployed BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // Insert or update student configuration
    await sql`
      INSERT INTO student_configs (
        session_token,
        student_name,
        student_email,
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
        current_step,
        twilio_connected,
        openai_connected,
        call_direction_chosen,
        services_ready,
        step4_code_validated,
        step4_committed,
        step4_deployed,
        step5_code_validated,
        step5_committed,
        step5_deployed,
        step6_code_validated,
        step6_committed,
        step6_deployed,
        system_prompt_saved,
        step7_committed,
        step7_deployed,
        tools_configured,
        step8_code_validated,
        step8_committed,
        step8_deployed,
        project_deployed,
        updated_at
      ) VALUES (
        ${sessionToken},
        ${studentName || null},
        ${studentEmail || null},
        ${encryptedApiKey},
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
        ${currentStep !== undefined ? currentStep : 0},
        ${twilioConnected || false},
        ${openaiConnected || false},
        ${callDirectionChosen || false},
        ${servicesReady || false},
        ${step4CodeValidated || false},
        ${step4Committed || false},
        ${step4Deployed || false},
        ${step5CodeValidated || false},
        ${step5Committed || false},
        ${step5Deployed || false},
        ${step6CodeValidated || false},
        ${step6Committed || false},
        ${step6Deployed || false},
        ${systemPromptSaved || false},
        ${step7Committed || false},
        ${step7Deployed || false},
        ${toolsConfigured || false},
        ${step8CodeValidated || false},
        ${step8Committed || false},
        ${step8Deployed || false},
        ${projectDeployed || false},
        NOW()
      )
      ON CONFLICT (session_token)
      DO UPDATE SET
        student_name = EXCLUDED.student_name,
        student_email = EXCLUDED.student_email,
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
        current_step = EXCLUDED.current_step,
        twilio_connected = EXCLUDED.twilio_connected,
        openai_connected = EXCLUDED.openai_connected,
        call_direction_chosen = EXCLUDED.call_direction_chosen,
        services_ready = EXCLUDED.services_ready,
        step4_code_validated = EXCLUDED.step4_code_validated,
        step4_committed = EXCLUDED.step4_committed,
        step4_deployed = EXCLUDED.step4_deployed,
        step5_code_validated = EXCLUDED.step5_code_validated,
        step5_committed = EXCLUDED.step5_committed,
        step5_deployed = EXCLUDED.step5_deployed,
        step6_code_validated = EXCLUDED.step6_code_validated,
        step6_committed = EXCLUDED.step6_committed,
        step6_deployed = EXCLUDED.step6_deployed,
        system_prompt_saved = EXCLUDED.system_prompt_saved,
        step7_committed = EXCLUDED.step7_committed,
        step7_deployed = EXCLUDED.step7_deployed,
        tools_configured = EXCLUDED.tools_configured,
        step8_code_validated = EXCLUDED.step8_code_validated,
        step8_committed = EXCLUDED.step8_committed,
        step8_deployed = EXCLUDED.step8_deployed,
        project_deployed = EXCLUDED.project_deployed,
        updated_at = NOW()
    `;

    console.log(`✅ Config saved for session: ${sessionToken.substring(0, 8)}...`);

    // Generate WebSocket URL to return to client
    const domain = (process.env.RAILWAY_WEBSOCKET_DOMAIN || '').trim();
    const generatedWebsocketUrl = `wss://${domain}/ws/${sessionToken}`;

    return res.status(200).json({
      success: true,
      message: 'Configuration saved',
      websocketUrl: generatedWebsocketUrl
    });

  } catch (error) {
    console.error('Save config error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to save configuration'
    });
  }
}
