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
            content: `You are a system prompt generator for voice AI applications. You MUST follow the template structure exactly. Your job is to take a user's use case and customize ONLY the role description and example interactions while keeping all the guidelines and sections identical to the template.`
          },
          {
            role: 'user',
            content: `Generate a system prompt for this use case: "${useCaseDescription}"
Call direction: ${callDirection}

You MUST use this EXACT template structure. Copy ALL sections and guidelines word-for-word. ONLY customize the parts in [brackets]:

---TEMPLATE START---
You are a helpful assistant [CUSTOMIZE THIS: describe their specific role based on: ${useCaseDescription}].

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

GOOD Response:
User: [CUSTOMIZE: Create a realistic question for this use case: ${useCaseDescription}]
You: [CUSTOMIZE: 1-2 sentence brief response]

BAD Response (too long):
User: [SAME question as above]
You: [CUSTOMIZE: Verbose 4-5 sentence response showing what NOT to do]

Remember: In voice conversations, brevity is key. Keep it natural and conversational.
---TEMPLATE END---

CRITICAL REQUIREMENTS:
- Copy the EXACT section headings: "# Voice Conversation Guidelines", "# Response Style", "# Example Interactions"
- Copy ALL bullet points under "Voice Conversation Guidelines" word-for-word
- Copy ALL bullet points under "Response Style" word-for-word
- Keep "GOOD Response:" and "BAD Response (too long):" labels exactly as shown
- Keep the final "Remember:" line exactly as shown
- ONLY customize: opening role description and the example User/You interactions

Also generate:
- "ivrGreeting": Friendly ${callDirection} greeting (1-2 sentences)
- "exampleQuestions": Array of 3-4 realistic questions
- "suggestedVoice": Voice type recommendation

Return ONLY valid JSON: {"systemPrompt": "...", "ivrGreeting": "...", "exampleQuestions": [...], "suggestedVoice": "..."}`
          }
        ],
        temperature: 0.3,
        max_tokens: 1500
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
