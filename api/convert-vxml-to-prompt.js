/**
 * Convert VXML to AI Prompt API
 *
 * POST /api/convert-vxml-to-prompt
 * Takes VXML content and converts it to a natural language system prompt
 * using OpenAI to analyze the VXML structure and generate appropriate prompts
 */

import OpenAI from 'openai';
import { applyCORS, handlePreflightRequest } from './_lib/cors.js';
import { applyRateLimit } from './_lib/ratelimit.js';

export default async function handler(req, res) {
  // Apply CORS
  applyCORS(req, res);

  // Handle preflight
  if (handlePreflightRequest(req, res)) {
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  // Apply rate limiting
  const allowed = await applyRateLimit(req, res);
  if (!allowed) {
    return;
  }

  try {
    const { vxmlContent, openaiApiKey } = req.body;

    if (!vxmlContent) {
      return res.status(400).json({
        success: false,
        error: 'VXML content is required'
      });
    }

    // Use provided API key or fall back to instructor's key
    const apiKey = openaiApiKey || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'OpenAI API key required. Please configure your API key first.'
      });
    }

    const openai = new OpenAI({ apiKey });

    // Use OpenAI to analyze VXML and generate system prompt
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert at analyzing VoiceXML (VXML) Interactive Voice Response (IVR) systems and converting them into natural language system prompts for AI voice assistants.

Your task is to:
1. Analyze the provided VXML code to understand the call flow, menu options, prompts, and logic
2. Extract the key behaviors, personality, and interaction patterns
3. Generate a comprehensive system prompt that would allow an AI assistant to replicate the same behavior in a conversational way
4. Include important details like:
   - The assistant's role and purpose
   - Menu options and their functions
   - How to handle different user inputs (DTMF digits, voice commands)
   - Tone and personality (formal, friendly, professional, etc.)
   - Any business rules or conditional logic
   - Error handling and clarification strategies

Output should be a clear, detailed system prompt that can be used directly with an LLM-powered voice assistant.
Keep responses brief and conversational for voice interactions.`
        },
        {
          role: 'user',
          content: `Convert this VXML IVR system into a natural language system prompt for an AI voice assistant:

\`\`\`xml
${vxmlContent}
\`\`\`

Provide:
1. A comprehensive system prompt that captures the IVR's behavior
2. A suggested greeting message
3. Any function tools that should be defined to replicate VXML functionality (if applicable)

Format your response as JSON:
{
  "systemPrompt": "The detailed system prompt...",
  "greeting": "The initial greeting message...",
  "suggestedTools": [
    {
      "name": "tool_name",
      "description": "What this tool does",
      "reasoning": "Why this tool is needed based on the VXML"
    }
  ],
  "vxmlAnalysis": {
    "purpose": "What the IVR does",
    "menuOptions": ["List of menu options found"],
    "tone": "Detected tone/personality",
    "specialFeatures": ["Any special features or logic"]
  }
}`
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });

    const responseText = completion.choices[0].message.content;

    // Try to parse as JSON
    let result;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : responseText;
      result = JSON.parse(jsonText);
    } catch (parseError) {
      // If JSON parsing fails, treat as plain text and structure it
      result = {
        systemPrompt: responseText,
        greeting: 'Hello! How can I help you today?',
        suggestedTools: [],
        vxmlAnalysis: {
          purpose: 'VXML conversion',
          menuOptions: [],
          tone: 'professional',
          specialFeatures: []
        }
      };
    }

    return res.status(200).json({
      success: true,
      ...result,
      usage: {
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens
      }
    });

  } catch (error) {
    console.error('Error converting VXML to prompt:', error);

    // Handle OpenAI-specific errors
    if (error.status === 401) {
      return res.status(401).json({
        success: false,
        error: 'Invalid OpenAI API key. Please check your key and try again.'
      });
    }

    if (error.status === 429) {
      return res.status(429).json({
        success: false,
        error: 'OpenAI rate limit exceeded. Please try again in a moment.'
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to convert VXML to prompt',
      details: error.message
    });
  }
}
