/**
 * Railway Deployment API
 *
 * Creates a Railway deployment from the student's GitHub repository.
 * Uses Railway's "Deploy from GitHub" template system.
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
    const { repoFullName, sessionToken } = req.body;

    // Input validation
    try {
      validateRequired(req.body, ['repoFullName']);
      validateString(repoFullName, 'repoFullName', {
        minLength: 3,
        maxLength: 200,
        pattern: /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+$/
      });

      if (sessionToken) {
        validateString(sessionToken, 'sessionToken', { minLength: 10, maxLength: 100 });
      }
    } catch (validationError) {
      return handleValidationError(validationError, res);
    }

    console.log(`Creating Railway deployment for ${repoFullName}...`);

    // Railway's "New Project from GitHub Repo" URL
    // This opens Railway's deployment flow in a new window
    // Student authenticates with GitHub OAuth (handled by Railway)
    // Railway auto-deploys and student returns with the URL

    const githubRepoUrl = `https://github.com/${repoFullName}`;

    // Railway's direct deploy URL format
    // Opens Railway with the repo pre-selected for deployment
    const railwayDeployUrl = `https://railway.app/new?plugins=gh:${repoFullName}`;

    // Backup: Manual project creation URL
    const railwayNewProjectUrl = `https://railway.app/new`;

    return res.status(200).json({
      success: true,
      message: 'Railway deployment ready',
      deployUrl: railwayDeployUrl,
      manualUrl: railwayNewProjectUrl,
      repoUrl: githubRepoUrl,
      repoFullName: repoFullName,
      flow: {
        step1: 'Opens Railway in new window',
        step2: 'Authenticates with GitHub (OAuth)',
        step3: 'Deploys repository automatically',
        step4: 'Student copies WebSocket URL',
        step5: 'Returns to workshop and continues'
      },
      expectedDeploymentTime: '60-90 seconds',
      note: 'Student will be prompted to create free Railway account if first time'
    });

  } catch (error) {
    console.error('Railway deployment error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to create Railway deployment'
    });
  }
}
