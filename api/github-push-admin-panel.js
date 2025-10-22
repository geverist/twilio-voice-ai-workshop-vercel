/**
 * Push Admin Panel HTML to Student GitHub Repository
 *
 * Generates personalized admin panel and commits it to their repo
 *
 * POST /api/github-push-admin-panel
 * Body: {
 *   accessToken: string,
 *   githubUsername: string,
 *   repoName: string,
 *   sessionToken: string
 * }
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
    const { accessToken, githubUsername, repoName, sessionToken } = req.body;

    // Validation
    if (!accessToken || !githubUsername || !repoName || !sessionToken) {
      return res.status(400).json({
        success: false,
        error: 'accessToken, githubUsername, repoName, and sessionToken are required'
      });
    }

    console.log(`📤 Pushing admin panel to ${githubUsername}/${repoName}...`);

    // Get student config for personalization
    const configs = await sql`
      SELECT student_name, session_token
      FROM student_configs
      WHERE session_token = ${sessionToken}
      LIMIT 1
    `;

    if (configs.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Configuration not found'
      });
    }

    const config = configs[0];
    const studentName = config.student_name || 'Student';

    // Read template
    const templatePath = join(process.cwd(), 'public', 'admin-panel-template.html');
    let htmlContent = readFileSync(templatePath, 'utf-8');

    // Determine API base URL
    const apiBase = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://twilio-voice-ai-workshop-vercel.vercel.app';

    // Replace template variables
    htmlContent = htmlContent
      .replace(/{{STUDENT_NAME}}/g, studentName)
      .replace(/{{SESSION_TOKEN}}/g, sessionToken)
      .replace(/{{SESSION_TOKEN_SHORT}}/g, sessionToken.substring(0, 30) + '...')
      .replace(/{{API_BASE}}/g, apiBase);

    // Check if file exists in repo
    const checkResponse = await fetch(
      `https://api.github.com/repos/${githubUsername}/${repoName}/contents/public/admin-panel.html`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Twilio-Workshop'
        }
      }
    );

    let sha = null;
    if (checkResponse.ok) {
      const existingFile = await checkResponse.json();
      sha = existingFile.sha;
      console.log(`  → File exists, will update (SHA: ${sha.substring(0, 7)}...)`);
    } else {
      console.log(`  → File doesn't exist, will create new`);
    }

    // Create or update file via GitHub API
    const commitMessage = sha
      ? `Update personalized admin panel\n\nSession: ${sessionToken.substring(0, 20)}...`
      : `Add personalized admin panel\n\nGenerated for ${studentName}\nSession: ${sessionToken.substring(0, 20)}...`;

    const createFileResponse = await fetch(
      `https://api.github.com/repos/${githubUsername}/${repoName}/contents/public/admin-panel.html`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'Twilio-Workshop'
        },
        body: JSON.stringify({
          message: commitMessage,
          content: Buffer.from(htmlContent).toString('base64'),
          sha: sha || undefined, // Include SHA if updating existing file
          branch: 'main'
        })
      }
    );

    if (!createFileResponse.ok) {
      const error = await createFileResponse.text();
      console.error('GitHub API error:', error);
      return res.status(createFileResponse.status).json({
        success: false,
        error: 'Failed to push to GitHub',
        details: error
      });
    }

    const fileData = await createFileResponse.json();

    console.log(`✅ Admin panel pushed successfully!`);
    console.log(`   Commit SHA: ${fileData.commit.sha.substring(0, 7)}...`);

    return res.status(200).json({
      success: true,
      message: sha ? 'Admin panel updated in repository' : 'Admin panel added to repository',
      commitSha: fileData.commit.sha,
      fileUrl: fileData.content.html_url,
      commitUrl: fileData.commit.html_url
    });

  } catch (error) {
    console.error('Push admin panel error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to push admin panel'
    });
  }
}
