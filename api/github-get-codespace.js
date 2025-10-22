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
    // GitHub Codespaces now provides port forwarding URLs in the API response
    let websocketUrl = null;
    let httpUrl = null;

    if (codespaceData.state === 'Available' && codespaceData.name) {
      // Modern Codespaces provide forwarded_ports in the API response
      // But we need to query the ports separately or construct from environment

      // Try to fetch ports information
      try {
        const portsResponse = await fetch(
          `https://api.github.com/user/codespaces/${codespaceData.name}/ports`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28'
            }
          }
        );

        if (portsResponse.ok) {
          const portsData = await portsResponse.json();
          // Find port 3000
          const port3000 = portsData.forwarded_ports?.find(p => p.port === 3000);

          if (port3000 && port3000.forwarded_url) {
            httpUrl = port3000.forwarded_url;
            websocketUrl = port3000.forwarded_url.replace(/^https:\/\//, 'wss://');

            // Verify the URL is actually reachable by testing HTTP endpoint
            try {
              const testResponse = await fetch(httpUrl + '/health', {
                method: 'GET',
                signal: AbortSignal.timeout(3000) // 3 second timeout
              });

              if (!testResponse.ok) {
                console.warn(`Port forwarding URL ${httpUrl} returned ${testResponse.status}, will try fallback`);
                httpUrl = null;
                websocketUrl = null;
              }
            } catch (testError) {
              console.warn(`Port forwarding URL ${httpUrl} not reachable, will try fallback`);
              httpUrl = null;
              websocketUrl = null;
            }
          }
        }
      } catch (portError) {
        console.warn('Could not fetch Codespace ports:', portError.message);
      }

      // Fallback: construct URL using GitHub Codespaces domain
      // Try both .github.dev (newer) and .app.github.dev (older)
      if (!websocketUrl) {
        websocketUrl = `wss://${codespaceData.name}-3000.github.dev`;
        httpUrl = `https://${codespaceData.name}-3000.github.dev`;
      }
    }

    return res.status(200).json({
      success: true,
      codespace: {
        id: codespaceData.id,
        name: codespaceData.name,
        state: codespaceData.state, // 'Starting', 'Available', 'Shutdown', etc.
        webUrl: codespaceData.web_url,
        websocketUrl: websocketUrl,
        httpUrl: httpUrl, // Also return HTTP URL for testing
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
