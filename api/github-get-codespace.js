/**
 * GitHub Codespaces Status API
 *
 * Gets the status and public URL of a student's Codespace
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
    const { accessToken, codespaceName, repoFullName } = req.body;

    if (!accessToken || (!codespaceName && !repoFullName)) {
      return res.status(400).json({
        success: false,
        error: 'Missing accessToken and codespaceName or repoFullName'
      });
    }

    let codespaceData = null;

    if (codespaceName) {
      // Get specific Codespace by name
      const getResponse = await fetch(
        `https://api.github.com/user/codespaces/${codespaceName}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
          }
        }
      );

      if (!getResponse.ok) {
        let errorMessage = 'Failed to get Codespace';
        try {
          const errorData = await getResponse.json();
          errorMessage = errorData.message || errorMessage;
        } catch (e) {
          errorMessage = `GitHub API error: ${getResponse.status} ${getResponse.statusText}`;
        }
        return res.status(200).json({
          success: false,
          error: errorMessage
        });
      }

      codespaceData = await getResponse.json();

    } else if (repoFullName) {
      // List all Codespaces for the repo and get the most recent one
      const listResponse = await fetch(
        `https://api.github.com/repos/${repoFullName}/codespaces`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
          }
        }
      );

      if (!listResponse.ok) {
        let errorMessage = 'Failed to list Codespaces';
        try {
          const errorData = await listResponse.json();
          errorMessage = errorData.message || errorMessage;
        } catch (e) {
          errorMessage = `GitHub API error: ${listResponse.status} ${listResponse.statusText}`;
        }
        return res.status(200).json({
          success: false,
          error: errorMessage
        });
      }

      const listData = await listResponse.json();

      // Find the most recently created Codespace
      if (listData.codespaces && listData.codespaces.length > 0) {
        codespaceData = listData.codespaces.sort((a, b) =>
          new Date(b.created_at) - new Date(a.created_at)
        )[0];
      } else {
        return res.status(404).json({
          success: false,
          error: 'No Codespaces found for this repository'
        });
      }
    }

    // Extract the public port URL (port 3000 for our WebSocket server)
    let websocketUrl = null;
    if (codespaceData.state === 'Available' && codespaceData.name) {
      // Codespaces URL format: https://{codespace-name}-3000.app.github.dev
      websocketUrl = `wss://${codespaceData.name}-3000.app.github.dev`;
    }

    return res.status(200).json({
      success: true,
      codespace: {
        id: codespaceData.id,
        name: codespaceData.name,
        state: codespaceData.state, // 'Starting', 'Available', 'Shutdown', etc.
        webUrl: codespaceData.web_url,
        websocketUrl: websocketUrl,
        machine: codespaceData.machine.name,
        createdAt: codespaceData.created_at,
        lastUsedAt: codespaceData.last_used_at
      }
    });

  } catch (error) {
    console.error('Error getting Codespace:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
}
