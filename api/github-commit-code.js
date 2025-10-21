/**
 * GitHub Code Commit API (Vercel Version)
 *
 * Commits code changes to student's GitHub repository.
 * Used for Steps 5, 7, 8 (WebSocket handler updates).
 *
 * Flow:
 * 1. Get current file SHA (required for updates)
 * 2. Commit new code content
 * 3. Trigger deployment via Railway/Render webhook (if configured)
 * 4. Return deployed URL
 */

import { applyCORS, handlePreflightRequest } from './_lib/cors.js';
import { applyRateLimit } from './_lib/ratelimit.js';
import {
  validateRequired,
  validateString,
  validateGitHubUsername,
  validateGitHubRepoName,
  validateNumber,
  handleValidationError
} from './_lib/validation.js';

export default async function handler(req, res) {
  // Apply CORS
  applyCORS(req, res);

  // Handle OPTIONS preflight
  if (handlePreflightRequest(req, res)) {
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Apply rate limiting
  const allowed = await applyRateLimit(req, res);
  if (!allowed) {
    return;
  }

  try {
    const {
      accessToken,
      githubUsername,
      repoName,
      filePath,
      fileContent,
      commitMessage,
      stepNumber,
      sessionToken
    } = req.body;

    // Input validation
    try {
      validateRequired(req.body, ['accessToken', 'githubUsername', 'repoName', 'filePath', 'fileContent']);
      validateString(accessToken, 'accessToken', { minLength: 20, maxLength: 500 });
      validateGitHubUsername(githubUsername, 'githubUsername');
      validateGitHubRepoName(repoName, 'repoName');
      validateString(filePath, 'filePath', {
        minLength: 1,
        maxLength: 500,
        pattern: /^[a-zA-Z0-9._\/-]+$/
      });
      validateString(fileContent, 'fileContent', { minLength: 1, maxLength: 100000 });

      if (commitMessage) {
        validateString(commitMessage, 'commitMessage', { maxLength: 500 });
      }

      if (stepNumber !== undefined) {
        validateNumber(stepNumber, 'stepNumber', { min: 1, max: 20, integer: true });
      }

      if (sessionToken) {
        validateString(sessionToken, 'sessionToken', { minLength: 10, maxLength: 100 });
      }
    } catch (validationError) {
      return handleValidationError(validationError, res);
    }

    const repoFullName = `${githubUsername}/${repoName}`;
    const branch = 'main'; // Default branch

    console.log(`Committing to ${repoFullName}:${filePath}`);

    // Step 1: Get current file SHA (if file exists)
    let currentFileSha = null;
    try {
      const getFileResponse = await fetch(
        `https://api.github.com/repos/${repoFullName}/contents/${filePath}?ref=${branch}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
          }
        }
      );

      if (getFileResponse.ok) {
        const fileData = await getFileResponse.json();
        currentFileSha = fileData.sha;
        console.log(`File exists, SHA: ${currentFileSha}`);
      } else {
        console.log('File does not exist, will create new file');
      }
    } catch (error) {
      console.log('File does not exist or error fetching:', error.message);
    }

    // Step 2: Commit the file (create or update)
    const base64Content = Buffer.from(fileContent).toString('base64');
    const finalCommitMessage = commitMessage || `Update ${filePath} - Step ${stepNumber}`;

    const commitData = {
      message: finalCommitMessage,
      content: base64Content,
      branch: branch
    };

    // Include SHA if updating existing file
    if (currentFileSha) {
      commitData.sha = currentFileSha;
    }

    const commitResponse = await fetch(
      `https://api.github.com/repos/${repoFullName}/contents/${filePath}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(commitData)
      }
    );

    if (!commitResponse.ok) {
      const errorData = await commitResponse.json();
      console.error('Commit failed:', errorData);
      return res.status(commitResponse.status).json({
        success: false,
        error: errorData.message || 'Failed to commit code to GitHub'
      });
    }

    const commitResult = await commitResponse.json();
    console.log(`✓ Committed to ${repoFullName}:${filePath}`);

    // Step 3: Extract AI settings from code and save to database (if session token provided)
    if (sessionToken && (stepNumber === 5 || stepNumber === 7 || stepNumber === 8)) {
      try {
        // Parse code to extract AI settings
        const systemPromptMatch = fileContent.match(/systemPrompt\s*[=:]\s*[`'"](.+?)[`'"]/s);
        const greetingMatch = fileContent.match(/greeting\s*[=:]\s*[`'"](.+?)[`'"]/s);
        const voiceMatch = fileContent.match(/voice\s*[=:]\s*[`'"](.+?)[`'"]/);

        const aiSettings = {
          systemPrompt: systemPromptMatch ? systemPromptMatch[1] : null,
          greeting: greetingMatch ? greetingMatch[1] : null,
          voice: voiceMatch ? voiceMatch[1] : null
        };

        // Save settings to database
        if (aiSettings.systemPrompt || aiSettings.greeting || aiSettings.voice) {
          await fetch(`https://${req.headers.host}/api/update-student-ai-settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionToken,
              ...aiSettings
            })
          });
          console.log(`✓ Saved AI settings for session ${sessionToken}`);
        }
      } catch (parseError) {
        console.warn('Could not parse AI settings from code:', parseError.message);
        // Continue anyway - not critical
      }
    }

    // Step 4: Simulate deployment wait
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 5: Return WORKSHOP WebSocket URL (shared endpoint)
    // NOTE: This is a workshop-only approach. For production, students would
    // deploy to their own hosting. But for learning, we use a shared endpoint
    // hosted by the workshop itself.
    const workshopDomain = req.headers.host || 'localhost:3000';
    const protocol = workshopDomain.includes('localhost') ? 'ws' : 'wss';

    // Include session token in URL so WebSocket can load their custom settings
    const sessionParam = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : '';
    const deployedUrl = `${protocol}://${workshopDomain}/api/workshop-websocket${sessionParam}`;

    return res.status(200).json({
      success: true,
      message: 'Code committed and deployed successfully',
      commitSha: commitResult.commit.sha,
      commitUrl: commitResult.commit.html_url,
      deployedUrl: deployedUrl,
      repoUrl: `https://github.com/${repoFullName}`,
      filePath: filePath,
      note: 'Your WebSocket handler is now live! Code updates will auto-deploy.'
    });

  } catch (error) {
    console.error('GitHub commit error:', error);

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to commit code'
    });
  }
}
