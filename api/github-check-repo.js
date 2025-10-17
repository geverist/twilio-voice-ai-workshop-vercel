/**
 * GitHub Repository Check (Vercel Version)
 *
 * Checks if a repository exists in the student's GitHub account
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
    const { accessToken, githubUsername, repoName } = req.body;

    if (!accessToken || !githubUsername || !repoName) {
      return res.status(401).json({
        success: false,
        error: 'Missing required parameters'
      });
    }

    // Check if repository exists using GitHub API
    const checkResponse = await fetch(
      `https://api.github.com/repos/${githubUsername}/${repoName}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }
    );

    if (checkResponse.status === 200) {
      // Repository exists
      const repoData = await checkResponse.json();
      return res.status(200).json({
        success: true,
        exists: true,
        repo: {
          name: repoData.name,
          fullName: repoData.full_name,
          url: repoData.html_url,
          createdAt: repoData.created_at,
          updatedAt: repoData.updated_at,
          description: repoData.description
        }
      });
    } else if (checkResponse.status === 404) {
      // Repository does not exist
      return res.status(200).json({
        success: true,
        exists: false
      });
    } else {
      // Other error
      const errorData = await checkResponse.json();
      return res.status(checkResponse.status).json({
        success: false,
        error: errorData.message || 'Failed to check repository'
      });
    }

  } catch (error) {
    console.error('GitHub repo check error:', error);

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to check repository'
    });
  }
}
