/**
 * API endpoint to generate workshop content using OpenAI based on user's use case
 *
 * POST /api/generate-use-case-content
 * Body: {
 *   useCaseDescription: string,
 *   callDirection: 'inbound' | 'outbound',
 *   openaiApiKey: string
 * }
 */

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { useCaseDescription, callDirection, openaiApiKey } = req.body;

    // Validation
    if (!useCaseDescription || !useCaseDescription.trim()) {
      return res.status(400).json({ error: 'Use case description is required' });
    }

    if (!callDirection || !['inbound', 'outbound'].includes(callDirection)) {
      return res.status(400).json({ error: 'Valid call direction is required (inbound or outbound)' });
    }

    if (!openaiApiKey || !openaiApiKey.startsWith('sk-')) {
      return res.status(400).json({ error: 'Valid OpenAI API key is required' });
    }

    console.log('🤖 Generating content for use case:', useCaseDescription.substring(0, 100));

    // Call OpenAI to generate customized content
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are a helpful assistant that generates customized content for a Twilio Voice AI workshop.
The workshop teaches developers how to build voice AI applications with Twilio ConversationRelay and OpenAI.
Based on the user's use case description, generate relevant examples, prompt suggestions, and IVR greetings.
Return your response as valid JSON only, with no markdown formatting or code blocks.`
          },
          {
            role: 'user',
            content: `The student wants to build: "${useCaseDescription}"
Call direction: ${callDirection}

Generate the following customized content (return as JSON):

1. "systemPrompt": A system prompt following this EXACT format and structure (customize for their use case):

You are a helpful assistant for [their specific use case].

# Voice Conversation Guidelines
- Keep responses BRIEF (1-2 sentences max)
- Be conversational and natural
- Avoid lists, bullet points, or structured formatting
- Don't say "as an AI" or mention you're artificial
- If you don't know something, say so briefly
- Respond quickly - every second matters in voice
- Use casual language, contractions, and natural speech patterns

# Response Style
- Short and direct
- Friendly but professional
- Natural and human-like

# Example Interactions
[Include 2 examples specific to their use case showing GOOD (brief) vs BAD (too long) responses]

Remember: In voice conversations, brevity is key. Keep it natural and conversational.

2. "ivrGreeting": A friendly greeting message for the ${callDirection} call (1-2 sentences)
3. "exampleQuestions": Array of 3-4 example questions/scenarios users might encounter with this bot
4. "suggestedVoice": Recommended voice type (professional, friendly, authoritative, etc.)

IMPORTANT: The systemPrompt MUST follow the voice best practices format above. Keep responses brief and conversational.
Return ONLY valid JSON with these keys, no markdown or explanations.`
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    if (!openaiResponse.ok) {
      const error = await openaiResponse.text();
      console.error('OpenAI API error:', error);
      return res.status(openaiResponse.status).json({
        error: 'Failed to generate content with OpenAI',
        details: error
      });
    }

    const openaiData = await openaiResponse.json();
    const generatedText = openaiData.choices[0].message.content.trim();

    // Parse the JSON response from OpenAI
    let generatedContent;
    try {
      // Remove markdown code blocks if present
      const cleanedText = generatedText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      generatedContent = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', generatedText);
      return res.status(500).json({
        error: 'Failed to parse AI response',
        rawResponse: generatedText
      });
    }

    console.log('✅ Generated content successfully');

    return res.status(200).json({
      success: true,
      content: {
        systemPrompt: generatedContent.systemPrompt || '',
        ivrGreeting: generatedContent.ivrGreeting || 'Hello! How can I help you today?',
        exampleQuestions: generatedContent.exampleQuestions || [],
        suggestedVoice: generatedContent.suggestedVoice || 'friendly'
      },
      usageTokens: openaiData.usage?.total_tokens || 0
    });

  } catch (error) {
    console.error('Error in generate-use-case-content:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
