/**
 * GitHub Repository Deletion API
 *
 * Deletes a GitHub repository (USE WITH CAUTION!)
 */

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { accessToken, repoFullName } = req.body;

    if (!accessToken || !repoFullName) {
      return res.status(400).json({
        success: false,
        error: 'Missing accessToken or repoFullName'
      });
    }

    // Validate repo name format (should be "username/repo-name")
    if (!repoFullName.includes('/')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid repository name format. Expected: username/repo-name'
      });
    }

    // Delete the repository using GitHub API
    const deleteResponse = await fetch(
      `https://api.github.com/repos/${repoFullName}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }
    );

    // GitHub returns 204 No Content on successful deletion
    if (deleteResponse.status === 204) {
      return res.status(200).json({
        success: true,
        message: `Repository ${repoFullName} deleted successfully`
      });
    }

    // Handle errors
    if (!deleteResponse.ok) {
      let errorMessage = 'Failed to delete repository';

      try {
        const errorData = await deleteResponse.json();
        errorMessage = errorData.message || errorMessage;
      } catch (e) {
        errorMessage = `GitHub API error: ${deleteResponse.status} ${deleteResponse.statusText}`;
      }

      return res.status(200).json({
        success: false,
        error: errorMessage
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Repository deleted'
    });

  } catch (error) {
    console.error('Error deleting repository:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
}
