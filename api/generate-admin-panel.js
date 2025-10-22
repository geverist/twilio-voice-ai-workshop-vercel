/**
 * Generate Personalized Admin Panel API
 *
 * Creates a custom admin-panel.html with embedded session token
 * Returns the HTML file content for download/deployment
 *
 * POST /api/generate-admin-panel
 * Body: { sessionToken: string }
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { applyCORS, handlePreflightRequest } from './_lib/cors.js';
import postgres from 'postgres';

// Create postgres connection
const sql = postgres(process.env.POSTGRES_URL, {
  ssl: 'require',
  max: 1
});

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

  try {
    const { sessionToken } = req.body;

    // Validation
    if (!sessionToken) {
      return res.status(400).json({
        success: false,
        error: 'sessionToken is required'
      });
    }

    console.log(`🎨 Generating admin panel for session: ${sessionToken.substring(0, 20)}...`);

    // Get student config to personalize
    const configs = await sql`
      SELECT
        student_name,
        session_token
      FROM student_configs
      WHERE session_token = ${sessionToken}
      LIMIT 1
    `;

    if (configs.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Configuration not found for this session token'
      });
    }

    const config = configs[0];
    const studentName = config.student_name || 'Student';
    const sessionTokenShort = sessionToken.substring(0, 30) + '...';

    // Read template file
    const templatePath = join(process.cwd(), 'public', 'admin-panel-template.html');
    let htmlContent = readFileSync(templatePath, 'utf-8');

    // Determine API base URL (Vercel deployment URL or localhost)
    const apiBase = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    // Replace template variables
    htmlContent = htmlContent
      .replace(/{{STUDENT_NAME}}/g, studentName)
      .replace(/{{SESSION_TOKEN}}/g, sessionToken)
      .replace(/{{SESSION_TOKEN_SHORT}}/g, sessionTokenShort)
      .replace(/{{API_BASE}}/g, apiBase);

    console.log(`✅ Admin panel generated for: ${studentName}`);

    return res.status(200).json({
      success: true,
      htmlContent: htmlContent,
      studentName: studentName,
      sessionToken: sessionToken
    });

  } catch (error) {
    console.error('Generate admin panel error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate admin panel'
    });
  }
}
