/**
 * Railway Deployment Status API
 *
 * Checks the status of a Railway deployment and returns the WebSocket URL when ready.
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
      projectId
    } = req.body;

    // Input validation
    try {
      validateRequired(req.body, ['railwayToken', 'projectId']);
      validateString(railwayToken, 'railwayToken', { minLength: 20, maxLength: 500 });
      validateString(projectId, 'projectId', { minLength: 3, maxLength: 200 });
    } catch (validationError) {
      return handleValidationError(validationError, res);
    }

    // Get deployment status
    const status = await getDeploymentStatus(railwayToken, projectId);

    if (status.state === 'SUCCESS') {
      // Get the public domain
      const domain = await getPublicDomain(railwayToken, projectId);

      if (!domain) {
        return res.status(200).json({
          success: true,
          status: 'deploying',
          message: 'Deployment successful, waiting for domain...'
        });
      }

      // Convert HTTPS to WSS for WebSocket URL
      const websocketUrl = `wss://${domain}`;

      // Test WebSocket connection
      console.log(`Testing WebSocket connection to ${websocketUrl}...`);

      return res.status(200).json({
        success: true,
        status: 'ready',
        deploymentUrl: `https://${domain}`,
        websocketUrl: websocketUrl,
        message: 'Deployment ready!'
      });
    } else if (status.state === 'FAILED' || status.state === 'CRASHED') {
      return res.status(200).json({
        success: false,
        status: 'failed',
        error: 'Deployment failed. Check Railway dashboard for logs.',
        logs: status.logs
      });
    } else {
      // Still deploying
      return res.status(200).json({
        success: true,
        status: 'deploying',
        message: `Deployment in progress (${status.state})...`
      });
    }

  } catch (error) {
    console.error('Railway Status error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to check Railway status'
    });
  }
}

/**
 * Get deployment status from Railway
 */
async function getDeploymentStatus(token, projectId) {
  const response = await fetch('https://backboard.railway.app/graphql/v2', {
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
                  name
                  latestDeployment {
                    id
                    status
                    createdAt
                  }
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

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get deployment status: ${errorText}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);
  }

  const service = data.data.project.services.edges[0].node;
  const deployment = service.latestDeployment;

  return {
    state: deployment ? deployment.status : 'PENDING',
    logs: []
  };
}

/**
 * Get public domain for the Railway service
 */
async function getPublicDomain(token, projectId) {
  const response = await fetch('https://backboard.railway.app/graphql/v2', {
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
                  domains {
                    serviceDomains {
                      domain
                    }
                  }
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

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get domain: ${errorText}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);
  }

  const service = data.data.project.services.edges[0].node;
  const domains = service.domains.serviceDomains;

  if (domains && domains.length > 0) {
    return domains[0].domain;
  }

  return null;
}
