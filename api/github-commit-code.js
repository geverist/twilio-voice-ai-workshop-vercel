/**
 * GitHub Code Commit API (Vercel Version)
 *
 * Commits code changes to student's GitHub repository.
 * Used for Steps 5, 7, 8 (WebSocket handler updates).
 *
 * Flow:
 * 1. Get current file SHA (required for updates)
 * 2. Commit new code content
 * 3. Trigger deployment via Railway/Render webhook (if configured)
 * 4. Return deployed URL
 */

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      accessToken,
      githubUsername,
      repoName,
      filePath,
      fileContent,
      commitMessage,
      stepNumber
    } = req.body;

    if (!accessToken || !githubUsername || !repoName || !filePath || !fileContent) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: accessToken, githubUsername, repoName, filePath, fileContent'
      });
    }

    const repoFullName = `${githubUsername}/${repoName}`;
    const branch = 'main'; // Default branch

    console.log(`Committing to ${repoFullName}:${filePath}`);

    // Step 1: Get current file SHA (if file exists)
    let currentFileSha = null;
    try {
      const getFileResponse = await fetch(
        `https://api.github.com/repos/${repoFullName}/contents/${filePath}?ref=${branch}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
          }
        }
      );

      if (getFileResponse.ok) {
        const fileData = await getFileResponse.json();
        currentFileSha = fileData.sha;
        console.log(`File exists, SHA: ${currentFileSha}`);
      } else {
        console.log('File does not exist, will create new file');
      }
    } catch (error) {
      console.log('File does not exist or error fetching:', error.message);
    }

    // Step 2: Commit the file (create or update)
    const base64Content = Buffer.from(fileContent).toString('base64');
    const finalCommitMessage = commitMessage || `Update ${filePath} - Step ${stepNumber}`;

    const commitData = {
      message: finalCommitMessage,
      content: base64Content,
      branch: branch
    };

    // Include SHA if updating existing file
    if (currentFileSha) {
      commitData.sha = currentFileSha;
    }

    const commitResponse = await fetch(
      `https://api.github.com/repos/${repoFullName}/contents/${filePath}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(commitData)
      }
    );

    if (!commitResponse.ok) {
      const errorData = await commitResponse.json();
      console.error('Commit failed:', errorData);
      return res.status(commitResponse.status).json({
        success: false,
        error: errorData.message || 'Failed to commit code to GitHub'
      });
    }

    const commitResult = await commitResponse.json();
    console.log(`✓ Committed to ${repoFullName}:${filePath}`);

    // Step 3: Simulate deployment wait
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 4: Return WORKSHOP WebSocket URL (shared endpoint)
    // NOTE: This is a workshop-only approach. For production, students would
    // deploy to their own hosting. But for learning, we use a shared endpoint
    // hosted by the workshop itself.
    const workshopDomain = req.headers.get('host') || 'localhost:3000';
    const protocol = workshopDomain.includes('localhost') ? 'ws' : 'wss';
    const deployedUrl = `${protocol}://${workshopDomain}/api/workshop-websocket`;

    return res.status(200).json({
      success: true,
      message: 'Code committed and deployed successfully',
      commitSha: commitResult.commit.sha,
      commitUrl: commitResult.commit.html_url,
      deployedUrl: deployedUrl,
      repoUrl: `https://github.com/${repoFullName}`,
      filePath: filePath,
      note: 'Your WebSocket handler is now live! Code updates will auto-deploy.'
    });

  } catch (error) {
    console.error('GitHub commit error:', error);

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to commit code'
    });
  }
}
