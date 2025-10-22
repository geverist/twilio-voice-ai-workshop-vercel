/**
 * Railway Deployment API
 *
 * Creates a Railway project and deploys the student's WebSocket server.
 * Uses Railway's GraphQL API to programmatically deploy code from GitHub.
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
      railwayToken,
      repoFullName,
      openaiApiKey
    } = req.body;

    // Input validation
    try {
      validateRequired(req.body, ['railwayToken', 'repoFullName']);
      validateString(railwayToken, 'railwayToken', { minLength: 20, maxLength: 500 });
      validateString(repoFullName, 'repoFullName', { minLength: 3, maxLength: 200 });
    } catch (validationError) {
      return handleValidationError(validationError, res);
    }

    console.log(`Deploying ${repoFullName} to Railway...`);

    // Step 1: Create Railway project
    const project = await createRailwayProject(railwayToken, repoFullName);
    console.log(`✓ Created Railway project: ${project.id}`);

    // Step 2: Connect GitHub repository
    await connectGitHubRepo(railwayToken, project.id, repoFullName);
    console.log(`✓ Connected GitHub repository`);

    // Step 3: Set environment variables
    const envVars = {};
    if (openaiApiKey) {
      envVars.OPENAI_API_KEY = openaiApiKey;
    }

    await setEnvironmentVariables(railwayToken, project.id, envVars);
    console.log(`✓ Set environment variables`);

    // Step 4: Trigger initial deployment
    const deployment = await triggerDeployment(railwayToken, project.id);
    console.log(`✓ Deployment triggered: ${deployment.id}`);

    return res.status(200).json({
      success: true,
      projectId: project.id,
      deploymentId: deployment.id,
      message: 'Railway deployment initiated. Checking status...'
    });

  } catch (error) {
    console.error('Railway Deploy error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to deploy to Railway'
    });
  }
}

/**
 * Create a Railway project using GraphQL API
 */
async function createRailwayProject(token, repoFullName) {
  const projectName = repoFullName.split('/')[1]; // Extract repo name

  const response = await fetch('https://backboard.railway.app/graphql/v2', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `
        mutation ProjectCreate($name: String!) {
          projectCreate(input: { name: $name }) {
            id
            name
          }
        }
      `,
      variables: {
        name: projectName
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create Railway project: ${errorText}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);
  }

  return data.data.projectCreate;
}

/**
 * Connect GitHub repository to Railway project
 */
async function connectGitHubRepo(token, projectId, repoFullName) {
  const [owner, repo] = repoFullName.split('/');

  const response = await fetch('https://backboard.railway.app/graphql/v2', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `
        mutation ServiceConnect($projectId: String!, $repo: String!) {
          serviceConnect(input: {
            projectId: $projectId,
            source: {
              repo: $repo
            }
          }) {
            id
          }
        }
      `,
      variables: {
        projectId: projectId,
        repo: repoFullName
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to connect GitHub repo: ${errorText}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);
  }

  return data.data.serviceConnect;
}

/**
 * Set environment variables for Railway service
 */
async function setEnvironmentVariables(token, projectId, envVars) {
  // Get the service ID first
  const serviceResponse = await fetch('https://backboard.railway.app/graphql/v2', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `
        query Project($id: String!) {
          project(id: $id) {
            services {
              edges {
                node {
                  id
                }
              }
            }
          }
        }
      `,
      variables: {
        id: projectId
      }
    })
  });

  const serviceData = await serviceResponse.json();
  const serviceId = serviceData.data.project.services.edges[0].node.id;

  // Set each environment variable
  for (const [key, value] of Object.entries(envVars)) {
    const response = await fetch('https://backboard.railway.app/graphql/v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: `
          mutation VariableUpsert($serviceId: String!, $name: String!, $value: String!) {
            variableUpsert(input: {
              serviceId: $serviceId,
              name: $name,
              value: $value
            })
          }
        `,
        variables: {
          serviceId: serviceId,
          name: key,
          value: value
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to set environment variable ${key}: ${errorText}`);
    }
  }
}

/**
 * Trigger a deployment
 */
async function triggerDeployment(token, projectId) {
  // Railway automatically deploys when you connect a repo
  // This function is a placeholder for future manual trigger needs
  return { id: 'auto-deployment' };
}
