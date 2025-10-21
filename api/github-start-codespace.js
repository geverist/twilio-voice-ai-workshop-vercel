/**
 * GitHub Codespace Start/Resume API
 *
 * Starts or resumes a stopped/sleeping Codespace
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
    const { accessToken, codespaceName } = req.body;

    // Input validation
    try {
      validateRequired(req.body, ['accessToken', 'codespaceName']);
      validateString(accessToken, 'accessToken', { minLength: 20, maxLength: 500 });
      validateString(codespaceName, 'codespaceName', { minLength: 5, maxLength: 200 });
    } catch (validationError) {
      return handleValidationError(validationError, res);
    }

    console.log(`Starting/resuming Codespace: ${codespaceName}...`);

    // Start the Codespace
    const startResponse = await fetch(
      `https://api.github.com/user/codespaces/${codespaceName}/start`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }
    );

    if (!startResponse.ok) {
      const errorData = await startResponse.json();
      console.error('Codespace start error:', errorData);

      return res.status(startResponse.status).json({
        success: false,
        error: errorData.message || 'Failed to start Codespace'
      });
    }

    const codespaceData = await startResponse.json();

    console.log(`✓ Codespace starting: ${codespaceData.name} (${codespaceData.state})`);

    return res.status(200).json({
      success: true,
      codespace: {
        id: codespaceData.id,
        name: codespaceData.name,
        state: codespaceData.state, // Should be 'Starting' or 'Available'
        webUrl: codespaceData.web_url,
        machine: codespaceData.machine.name
      }
    });

  } catch (error) {
    console.error('Error starting Codespace:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
}
