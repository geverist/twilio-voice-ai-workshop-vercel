/**
 * GitHub List Repositories API
 *
 * Lists user's repositories to allow selecting existing workshop repos
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
    const { accessToken, githubUsername } = req.body;

    if (!accessToken || !githubUsername) {
      return res.status(400).json({
        success: false,
        error: 'Missing accessToken or githubUsername'
      });
    }

    // List user's repositories
    const listResponse = await fetch(`https://api.github.com/users/${githubUsername}/repos?sort=updated&per_page=100`, {
      headers: {
        'Authorization': `token ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Twilio-Workshop-App'
      }
    });

    if (!listResponse.ok) {
      const errorData = await listResponse.json();
      return res.status(listResponse.status).json({
        success: false,
        error: errorData.message || 'Failed to list repositories'
      });
    }

    const allRepos = await listResponse.json();

    // Filter for repositories created from conversationrelay-starter-pack template
    // Check for:
    // 1. Exact description match (set during template generation)
    // 2. Repo name starts with 'ws-' (our session-based naming)
    // 3. Repo name contains 'conversationrelay' or 'voice-ai'
    const TEMPLATE_DESCRIPTION = 'My AI-powered voice assistant built with Twilio ConversationRelay';

    const workshopRepos = allRepos.filter(repo => {
      const name = repo.name.toLowerCase();
      const description = (repo.description || '').toLowerCase();

      // Primary check: exact description match (most reliable)
      if (description === TEMPLATE_DESCRIPTION.toLowerCase()) {
        return true;
      }

      // Secondary check: session-based naming (ws-*)
      if (name.startsWith('ws-') && name.includes('voice-ai')) {
        return true;
      }

      // Tertiary check: contains conversationrelay (for custom named repos)
      if (name.includes('conversationrelay')) {
        return true;
      }

      return false;
    });

    return res.status(200).json({
      success: true,
      repos: workshopRepos.map(repo => ({
        name: repo.name,
        url: repo.html_url,
        description: repo.description,
        createdAt: repo.created_at,
        updatedAt: repo.updated_at,
        private: repo.private
      }))
    });

  } catch (error) {
    console.error('Error listing repositories:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
}
