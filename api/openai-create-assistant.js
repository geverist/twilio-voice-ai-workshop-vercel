/**
 * Create or Update OpenAI Assistant with Tools
 *
 * Creates/updates an OpenAI Assistant with the student's configured tools
 * Stores the Assistant ID in the database for use in ConversationRelay
 *
 * POST /api/openai-create-assistant
 * Body: {
 *   sessionToken: string,
 *   openaiApiKey: string,
 *   systemPrompt: string,
 *   tools: array,
 *   assistantName?: string
 * }
 */

import { applyCORS, handlePreflightRequest } from './_lib/cors.js';
import { applyRateLimit } from './_lib/ratelimit.js';
import postgres from 'postgres';

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

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Apply rate limiting
  const allowed = await applyRateLimit(req, res);
  if (!allowed) {
    return;
  }

  try {
    const {
      sessionToken,
      openaiApiKey,
      systemPrompt,
      tools,
      assistantName
    } = req.body;

    // Validation
    if (!sessionToken) {
      return res.status(400).json({
        success: false,
        error: 'sessionToken is required'
      });
    }

    if (!openaiApiKey || !openaiApiKey.startsWith('sk-')) {
      return res.status(400).json({
        success: false,
        error: 'Valid OpenAI API key is required'
      });
    }

    console.log(`🤖 Creating/updating OpenAI Assistant for session: ${sessionToken.substring(0, 20)}...`);

    // Get existing assistant ID if any
    const configs = await sql`
      SELECT openai_assistant_id, student_name, use_case_description
      FROM student_configs
      WHERE session_token = ${sessionToken}
      LIMIT 1
    `;

    const existingAssistantId = configs.length > 0 ? configs[0].openai_assistant_id : null;
    const studentName = configs.length > 0 ? configs[0].student_name : 'Student';
    const useCaseDescription = configs.length > 0 ? configs[0].use_case_description : '';

    const name = assistantName || `${studentName}'s Voice AI Assistant`;
    const instructions = systemPrompt || 'You are a helpful voice assistant.';

    // Prepare tools array in OpenAI format
    const formattedTools = (tools || []).map(tool => {
      // If already in correct format
      if (tool.type === 'function' && tool.function) {
        return tool;
      }
      // If in old format, convert
      return {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters || { type: 'object', properties: {} }
        }
      };
    });

    let assistantId;
    let action;

    if (existingAssistantId) {
      // Update existing assistant
      console.log(`  → Updating existing assistant: ${existingAssistantId}`);

      const updateResponse = await fetch(
        `https://api.openai.com/v1/assistants/${existingAssistantId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
            'OpenAI-Beta': 'assistants=v2'
          },
          body: JSON.stringify({
            name: name,
            instructions: instructions,
            tools: formattedTools,
            model: 'gpt-4-turbo-preview'
          })
        }
      );

      if (!updateResponse.ok) {
        const error = await updateResponse.text();
        console.error('OpenAI update error:', error);

        // If assistant doesn't exist anymore, create new one
        if (updateResponse.status === 404) {
          console.log('  → Assistant not found, creating new one');
          existingAssistantId = null; // Fall through to create
        } else {
          return res.status(updateResponse.status).json({
            success: false,
            error: 'Failed to update OpenAI Assistant',
            details: error
          });
        }
      } else {
        const assistant = await updateResponse.json();
        assistantId = assistant.id;
        action = 'updated';
      }
    }

    if (!existingAssistantId) {
      // Create new assistant
      console.log(`  → Creating new assistant`);

      const createResponse = await fetch(
        'https://api.openai.com/v1/assistants',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
            'OpenAI-Beta': 'assistants=v2'
          },
          body: JSON.stringify({
            name: name,
            instructions: instructions,
            tools: formattedTools,
            model: 'gpt-4-turbo-preview',
            metadata: {
              workshop_session: sessionToken.substring(0, 20),
              use_case: useCaseDescription.substring(0, 100)
            }
          })
        }
      );

      if (!createResponse.ok) {
        const error = await createResponse.text();
        console.error('OpenAI create error:', error);
        return res.status(createResponse.status).json({
          success: false,
          error: 'Failed to create OpenAI Assistant',
          details: error
        });
      }

      const assistant = await createResponse.json();
      assistantId = assistant.id;
      action = 'created';
    }

    // Store assistant ID in database
    await sql`
      UPDATE student_configs
      SET openai_assistant_id = ${assistantId},
          updated_at = NOW()
      WHERE session_token = ${sessionToken}
    `;

    console.log(`✅ Assistant ${action}: ${assistantId}`);

    return res.status(200).json({
      success: true,
      action: action,
      assistantId: assistantId,
      toolsCount: formattedTools.length,
      message: `OpenAI Assistant ${action} successfully with ${formattedTools.length} tools`
    });

  } catch (error) {
    console.error('Create assistant error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to create/update assistant'
    });
  }
}
