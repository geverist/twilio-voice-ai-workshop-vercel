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

    // Step 1: Create Railway project with environment
    const { project, environment } = await createRailwayProject(railwayToken, repoFullName);
    console.log(`✓ Created Railway project: ${project.id}`);

    // Step 2: Create service with GitHub repo and environment variables
    const envVars = {};
    if (openaiApiKey) {
      envVars.OPENAI_API_KEY = openaiApiKey;
    }

    const service = await createServiceWithRepo(
      railwayToken,
      project.id,
      environment.id,
      repoFullName,
      envVars
    );
    console.log(`✓ Created service with GitHub repo: ${service.id}`);

    return res.status(200).json({
      success: true,
      projectId: project.id,
      serviceId: service.id,
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
 * Create a Railway project and get the default environment
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
            environments {
              edges {
                node {
                  id
                  name
                }
              }
            }
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

  const project = data.data.projectCreate;
  const environment = project.environments.edges[0].node; // Get default "production" environment

  return { project, environment };
}

/**
 * Create a service with GitHub repo in one call
 */
async function createServiceWithRepo(token, projectId, environmentId, repoFullName, envVars) {
  const response = await fetch('https://backboard.railway.app/graphql/v2', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `
        mutation ServiceCreate(
          $projectId: String!,
          $environmentId: String!,
          $repo: String!,
          $variables: EnvironmentVariables
        ) {
          serviceCreate(input: {
            projectId: $projectId,
            environmentId: $environmentId,
            source: {
              repo: $repo
            },
            variables: $variables
          }) {
            id
            name
          }
        }
      `,
      variables: {
        projectId: projectId,
        environmentId: environmentId,
        repo: repoFullName,
        variables: envVars
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create service: ${errorText}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);
  }

  return data.data.serviceCreate;
}
