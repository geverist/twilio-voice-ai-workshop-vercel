/**
 * GitHub Update System Prompt API
 *
 * Updates the system-prompt.js file in the student's GitHub repository
 * with their custom system prompt from Step 7.
 */

import { applyCORS, handlePreflightRequest } from './_lib/cors.js';
import { applyRateLimit } from './_lib/ratelimit.js';
import {
  validateRequired,
  validateString,
  handleValidationError
} from './_lib/validation.js';

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
      githubToken,
      githubUsername,
      repoName,
      systemPrompt
    } = req.body;

    // Input validation
    try {
      validateRequired(req.body, ['githubToken', 'githubUsername', 'repoName', 'systemPrompt']);
      validateString(githubToken, 'githubToken', { minLength: 20, maxLength: 500 });
      validateString(githubUsername, 'githubUsername', { minLength: 1, maxLength: 100 });
      validateString(repoName, 'repoName', { minLength: 1, maxLength: 100 });
      validateString(systemPrompt, 'systemPrompt', { minLength: 1, maxLength: 10000 });
    } catch (validationError) {
      return handleValidationError(validationError, res);
    }

    console.log(`Updating system prompt in ${githubUsername}/${repoName}`);

    const filePath = 'config/system-prompt.js';

    // Generate the updated file content
    const fileContent = `/**
 * System Prompt Configuration
 *
 * This prompt defines your AI's personality, behavior, and constraints.
 * It's sent to OpenAI at the start of each conversation.
 */

const systemPrompt = \`${systemPrompt.replace(/`/g, '\\`')}\`;

export default systemPrompt;
`;

    // Get the current file (to get its SHA for updating)
    const getFileResponse = await fetch(
      `https://api.github.com/repos/${githubUsername}/${repoName}/contents/${filePath}`,
      {
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }
    );

    let fileSha = null;
    if (getFileResponse.ok) {
      const fileData = await getFileResponse.json();
      fileSha = fileData.sha;
    }

    // Update or create the file
    const updateResponse = await fetch(
      `https://api.github.com/repos/${githubUsername}/${repoName}/contents/${filePath}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: 'Update system prompt from workshop',
          content: Buffer.from(fileContent).toString('base64'),
          sha: fileSha || undefined
        })
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Failed to update file: ${errorText}`);
    }

    console.log(`✅ Updated system prompt in ${githubUsername}/${repoName}`);

    return res.status(200).json({
      success: true,
      message: 'System prompt updated in GitHub repository'
    });

  } catch (error) {
    console.error('GitHub update error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to update system prompt'
    });
  }
}
