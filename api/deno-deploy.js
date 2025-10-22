/**
 * Deno Deploy (Subhosting) API
 *
 * Creates a Deno Deploy project and deployment for a student's WebSocket server.
 * Uses Deno Subhosting API to programmatically deploy student code.
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
    const { githubToken, repoFullName, studentName } = req.body;

    // Input validation
    try {
      validateRequired(req.body, ['githubToken', 'repoFullName']);
      validateString(githubToken, 'githubToken', { minLength: 20, maxLength: 500 });
      validateString(repoFullName, 'repoFullName', { minLength: 3, maxLength: 200 });
    } catch (validationError) {
      return handleValidationError(validationError, res);
    }

    // Get Deno credentials from environment
    const DENO_DEPLOY_TOKEN = process.env.DENO_DEPLOY_TOKEN;
    const DENO_ORG_ID = process.env.DENO_ORG_ID;

    if (!DENO_DEPLOY_TOKEN || !DENO_ORG_ID) {
      return res.status(500).json({
        success: false,
        error: 'Deno Deploy not configured. Please contact workshop administrator.'
      });
    }

    console.log(`Deploying ${repoFullName} to Deno Deploy...`);

    // Step 1: Fetch repository files from GitHub
    const repoFiles = await fetchGitHubRepoFiles(githubToken, repoFullName);

    // Step 2: Create Deno project
    const projectName = `workshop-${repoFullName.split('/')[1]}-${Date.now()}`.toLowerCase();
    const project = await createDenoProject(DENO_DEPLOY_TOKEN, DENO_ORG_ID, projectName, studentName);

    console.log(`✓ Created Deno project: ${project.id}`);

    // Step 3: Create deployment with repo files
    const deployment = await createDenoDeployment(
      DENO_DEPLOY_TOKEN,
      project.id,
      repoFiles
    );

    console.log(`✓ Deployment created: ${deployment.id}`);

    // Step 4: Get deployment URL
    const deploymentUrl = deployment.domains && deployment.domains.length > 0
      ? `https://${deployment.domains[0]}`
      : `https://${projectName}-${deployment.id.substring(0, 8)}.deno.dev`;

    const websocketUrl = deploymentUrl.replace(/^https:\/\//, 'wss://');

    return res.status(200).json({
      success: true,
      projectId: project.id,
      deploymentId: deployment.id,
      deploymentUrl: deploymentUrl,
      websocketUrl: websocketUrl,
      message: 'WebSocket server deployed successfully to Deno Deploy!'
    });

  } catch (error) {
    console.error('Deno Deploy error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to deploy to Deno'
    });
  }
}

/**
 * Fetch all files from a GitHub repository
 */
async function fetchGitHubRepoFiles(token, repoFullName) {
  // Get the default branch
  const repoResponse = await fetch(
    `https://api.github.com/repos/${repoFullName}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }
  );

  if (!repoResponse.ok) {
    throw new Error(`Failed to fetch repository info: ${repoResponse.statusText}`);
  }

  const repoData = await repoResponse.json();
  const defaultBranch = repoData.default_branch;

  // Get the tree (all files) from the default branch
  const treeResponse = await fetch(
    `https://api.github.com/repos/${repoFullName}/git/trees/${defaultBranch}?recursive=1`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }
  );

  if (!treeResponse.ok) {
    throw new Error(`Failed to fetch repository tree: ${treeResponse.statusText}`);
  }

  const treeData = await treeResponse.json();

  // Fetch content for each file
  const assets = {};

  for (const item of treeData.tree) {
    // Skip directories and large files
    if (item.type !== 'blob') continue;

    // Skip common non-essential files
    if (item.path.startsWith('.git') ||
        item.path === '.env' ||
        item.path.startsWith('node_modules/')) {
      continue;
    }

    // Fetch file content using the blob SHA
    const blobResponse = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/blobs/${item.sha}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }
    );

    if (blobResponse.ok) {
      const blobData = await blobResponse.json();

      // Deno supports base64 or utf-8 encoding
      assets[item.path] = {
        kind: 'file',
        content: blobData.content, // GitHub returns base64
        encoding: 'base64'
      };
    }
  }

  return assets;
}

/**
 * Create a Deno Deploy project
 */
async function createDenoProject(token, orgId, projectName, description) {
  const response = await fetch(
    `https://api.deno.com/v1/organizations/${orgId}/projects`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: projectName,
        description: description || `Workshop project: ${projectName}`
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create Deno project: ${errorText}`);
  }

  return await response.json();
}

/**
 * Create a Deno deployment
 */
async function createDenoDeployment(token, projectId, assets) {
  const response = await fetch(
    `https://api.deno.com/v1/projects/${projectId}/deployments`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        entryPointUrl: 'server.js',
        assets: assets,
        envVars: {}, // Empty for now, can add Twilio creds later
        importMapUrl: null, // Auto-discover from deno.json if exists
        lockFileUrl: null, // Auto-discover
        description: 'Workshop WebSocket server deployment'
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create Deno deployment: ${errorText}`);
  }

  return await response.json();
}
