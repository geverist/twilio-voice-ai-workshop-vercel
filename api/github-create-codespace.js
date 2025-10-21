/**
 * GitHub Codespaces Creation API
 *
 * Creates and launches a GitHub Codespace for the student's workshop repository
 */

import { applyCORS, handlePreflightRequest } from './_lib/cors.js';
import { applyRateLimit } from './_lib/ratelimit.js';
import {
  validateRequired,
  validateString,
  validateGitHubUsername,
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
    const { accessToken, repoFullName, githubUsername } = req.body;

    // Input validation
    try {
      validateRequired(req.body, ['accessToken', 'repoFullName']);
      validateString(accessToken, 'accessToken', { minLength: 20, maxLength: 500 });
      validateString(repoFullName, 'repoFullName', {
        minLength: 3,
        maxLength: 200,
        pattern: /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+$/
      });

      if (githubUsername) {
        validateGitHubUsername(githubUsername, 'githubUsername');
      }
    } catch (validationError) {
      return handleValidationError(validationError, res);
    }

    console.log(`Creating Codespace for ${repoFullName}...`);

    // Create a new Codespace
    const createResponse = await fetch(
      `https://api.github.com/repos/${repoFullName}/codespaces`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ref: 'main',
          machine: 'basicLinux32gb', // Free tier machine
          idle_timeout_minutes: 30,
          retention_period_minutes: 120 // Auto-delete after 2 hours of inactivity
        })
      }
    );

    if (!createResponse.ok) {
      const errorData = await createResponse.json();
      console.error('Codespace creation error:', errorData);

      // Check for common errors
      if (createResponse.status === 403) {
        return res.status(403).json({
          success: false,
          error: 'GitHub Codespaces not available. Please check your GitHub account permissions.'
        });
      }

      return res.status(createResponse.status).json({
        success: false,
        error: errorData.message || 'Failed to create Codespace'
      });
    }

    const codespaceData = await createResponse.json();

    console.log(`✓ Codespace created: ${codespaceData.name}`);
    console.log(`  Status: ${codespaceData.state}`);
    console.log(`  Web URL: ${codespaceData.web_url}`);

    // The Codespace might still be starting, so we'll return the data
    // and let the frontend poll for the public URL
    return res.status(200).json({
      success: true,
      codespace: {
        id: codespaceData.id,
        name: codespaceData.name,
        state: codespaceData.state, // 'Starting', 'Available', 'Shutdown', etc.
        webUrl: codespaceData.web_url, // URL to open in browser
        machine: codespaceData.machine.name,
        createdAt: codespaceData.created_at
      }
    });

  } catch (error) {
    console.error('Error creating Codespace:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
}
