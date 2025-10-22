/**
 * Railway Deployment API
 *
 * Generates a Railway deployment URL for the student's GitHub repository.
 * Railway handles OAuth and deployment automatically.
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
    const { repoFullName, githubUsername, repoName } = req.body;

    // Input validation
    try {
      validateRequired(req.body, ['repoFullName']);
      validateString(repoFullName, 'repoFullName', {
        minLength: 3,
        maxLength: 200,
        pattern: /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+$/
      });
    } catch (validationError) {
      return handleValidationError(validationError, res);
    }

    console.log(`Creating Railway deployment URL for ${repoFullName}...`);

    // Railway "Deploy from GitHub" URL format
    // This opens Railway with the repo pre-selected for deployment
    const railwayDeployUrl = `https://railway.app/new/github?repo=${encodeURIComponent(repoFullName)}`;

    // Alternative: Template-based deployment (if we configure a template)
    // const railwayTemplateUrl = `https://railway.app/template/${templateId}`;

    return res.status(200).json({
      success: true,
      deployUrl: railwayDeployUrl,
      repoFullName: repoFullName,
      message: 'Railway deployment URL generated',
      instructions: {
        step1: 'Click the Deploy URL to open Railway',
        step2: 'Authenticate with GitHub (if not already)',
        step3: 'Railway will auto-deploy your repository',
        step4: 'Copy the deployment URL when ready'
      }
    });

  } catch (error) {
    console.error('Railway deployment URL error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate Railway deployment URL'
    });
  }
}
