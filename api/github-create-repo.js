/**
 * GitHub Repository Creation (Vercel Version)
 *
 * Creates a new repository in the student's GitHub account from the
 * conversationrelay-starter-pack template.
 *
 * NOTE: This simplified version accepts the GitHub access token directly.
 * In production, you'd want to use a session store like Redis or Vercel KV.
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
    const { accessToken, githubUsername, repoName, sessionToken } = req.body;

    if (!accessToken || !githubUsername) {
      return res.status(401).json({
        success: false,
        error: 'No GitHub credentials provided. Please authenticate with GitHub first.'
      });
    }

    // Template repository info
    const TEMPLATE_OWNER = process.env.GITHUB_TEMPLATE_OWNER || 'geverist';
    const TEMPLATE_REPO = process.env.GITHUB_TEMPLATE_REPO || 'conversationrelay-starter-pack';

    // Generate unique repo name using session token prefix
    // Format: ws-{timestamp}-{random}-voice-ai-app
    let finalRepoName;
    if (repoName) {
      // User provided custom name - use it as-is
      finalRepoName = repoName;
    } else if (sessionToken) {
      // Generate unique name from session token
      // Session token format: ws_{timestamp}_{random}
      // Repo name format: ws-{timestamp}-{random}-voice-ai
      finalRepoName = sessionToken.replace(/_/g, '-') + '-voice-ai';
    } else {
      // Fallback to timestamp-based name
      finalRepoName = 'workshop-' + Date.now() + '-voice-ai';
    }

    // Create repository from template using GitHub API
    const createRepoResponse = await fetch(
      `https://api.github.com/repos/${TEMPLATE_OWNER}/${TEMPLATE_REPO}/generate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          owner: githubUsername,
          name: finalRepoName,
          description: 'My AI-powered voice assistant built with Twilio ConversationRelay',
          include_all_branches: false,
          private: false
        })
      }
    );

    if (!createRepoResponse.ok) {
      const errorData = await createRepoResponse.json();
      let errorMessage = errorData.message || 'Failed to create repository';

      // Handle common errors
      if (createRepoResponse.status === 422 && errorMessage.includes('already exists')) {
        errorMessage = 'Repository name already exists in your account. Choose a different name.';
      }

      return res.status(createRepoResponse.status).json({
        success: false,
        error: errorMessage
      });
    }

    const repoData = await createRepoResponse.json();
    const repoUrl = repoData.html_url;
    const repoFullName = repoData.full_name;
    const cloneUrl = repoData.clone_url;

    console.log(`✓ Created repository: ${repoFullName}`);

    return res.status(200).json({
      success: true,
      repoUrl: repoUrl,
      repoName: finalRepoName,
      repoFullName: repoFullName,
      cloneUrl: cloneUrl,
      githubUsername: githubUsername
    });

  } catch (error) {
    console.error('GitHub repo creation error:', error);

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to create repository'
    });
  }
}
