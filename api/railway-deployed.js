/**
 * Railway Deployed Notification API
 *
 * Receives automatic notifications from Railway deployments.
 * Stores deployment URLs so the workshop frontend can poll for completion.
 */

import { applyCORS, handlePreflightRequest } from './_lib/cors.js';
import {
  validateRequired,
  validateString,
  handleValidationError
} from './_lib/validation.js';

// In-memory storage for deployment notifications
// Key: sessionId, Value: { deploymentUrl, timestamp }
// In production, you'd use Redis or a database
const deploymentNotifications = new Map();

// Clean up old notifications (older than 1 hour)
function cleanupOldNotifications() {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (const [sessionId, data] of deploymentNotifications.entries()) {
    if (new Date(data.timestamp).getTime() < oneHourAgo) {
      deploymentNotifications.delete(sessionId);
    }
  }
}

// Run cleanup every 10 minutes
setInterval(cleanupOldNotifications, 10 * 60 * 1000);

export default async function handler(req, res) {
  // Apply CORS
  applyCORS(req, res);

  // Handle preflight
  if (handlePreflightRequest(req, res)) {
    return;
  }

  // POST: Receive deployment notification
  if (req.method === 'POST') {
    try {
      const { sessionId, deploymentUrl, timestamp } = req.body;

      // Input validation
      try {
        validateRequired(req.body, ['sessionId', 'deploymentUrl']);
        validateString(sessionId, 'sessionId', {
          minLength: 10,
          maxLength: 200
        });
        validateString(deploymentUrl, 'deploymentUrl', {
          minLength: 10,
          maxLength: 500,
          pattern: /^wss:\/\/.+/
        });
      } catch (validationError) {
        return handleValidationError(validationError, res);
      }

      console.log(`📡 Railway deployment notification received:`);
      console.log(`   Session ID: ${sessionId}`);
      console.log(`   Deployment URL: ${deploymentUrl}`);
      console.log(`   Timestamp: ${timestamp}`);

      // Store the deployment notification
      deploymentNotifications.set(sessionId, {
        deploymentUrl,
        timestamp: timestamp || new Date().toISOString()
      });

      return res.status(200).json({
        success: true,
        message: 'Deployment notification received',
        sessionId
      });

    } catch (error) {
      console.error('Railway deployment notification error:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to process deployment notification'
      });
    }
  }

  // GET: Poll for deployment status
  if (req.method === 'GET') {
    try {
      const { sessionId } = req.query;

      // Input validation
      try {
        validateRequired({ sessionId }, ['sessionId']);
        validateString(sessionId, 'sessionId', {
          minLength: 10,
          maxLength: 200
        });
      } catch (validationError) {
        return handleValidationError(validationError, res);
      }

      // Check if deployment notification exists
      const deployment = deploymentNotifications.get(sessionId);

      if (deployment) {
        console.log(`✅ Deployment found for session ${sessionId}: ${deployment.deploymentUrl}`);

        // Return and remove from storage (one-time use)
        deploymentNotifications.delete(sessionId);

        return res.status(200).json({
          success: true,
          deployed: true,
          deploymentUrl: deployment.deploymentUrl,
          timestamp: deployment.timestamp
        });
      } else {
        // Not deployed yet
        return res.status(200).json({
          success: true,
          deployed: false,
          message: 'Deployment not yet complete'
        });
      }

    } catch (error) {
      console.error('Railway deployment poll error:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to check deployment status'
      });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
