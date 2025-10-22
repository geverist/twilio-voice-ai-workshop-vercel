/**
 * Railway Get Deployment API
 *
 * Helps student find their Railway deployment URL.
 * Since Railway doesn't provide a simple API without their token,
 * we guide students to copy their URL from Railway dashboard.
 */

import { applyCORS, handlePreflightRequest } from './_lib/cors.js';

export default async function handler(req, res) {
  // Apply CORS
  applyCORS(req, res);

  // Handle preflight
  if (handlePreflightRequest(req, res)) {
    return;
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Return instructions for finding the Railway deployment URL
  return res.status(200).json({
    success: true,
    instructions: {
      title: 'Find Your Railway WebSocket URL',
      steps: [
        {
          step: 1,
          action: 'Go to Railway dashboard',
          url: 'https://railway.app/dashboard',
          description: 'Open your Railway dashboard in a new tab'
        },
        {
          step: 2,
          action: 'Click on your project',
          description: 'Find and click on the project you just deployed'
        },
        {
          step: 3,
          action: 'Click on the service',
          description: 'Click on the service (should show "Active" status)'
        },
        {
          step: 4,
          action: 'Click "Settings" tab',
          description: 'Navigate to the Settings tab in the service'
        },
        {
          step: 5,
          action: 'Find "Domains" section',
          description: 'Scroll down to the Domains section'
        },
        {
          step: 6,
          action: 'Copy the domain',
          description: 'Copy the .railway.app domain (e.g., https://web-production-abc123.up.railway.app)'
        },
        {
          step: 7,
          action: 'Convert to WebSocket URL',
          description: 'Replace https:// with wss:// in your mind or use the converter below'
        }
      ],
      urlFormat: {
        http: 'https://your-service.up.railway.app',
        websocket: 'wss://your-service.up.railway.app'
      },
      note: 'Railway automatically generates a public HTTPS URL when you deploy. The WebSocket URL is the same domain with wss:// protocol.'
    }
  });
}
