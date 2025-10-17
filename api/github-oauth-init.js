/**
 * GitHub OAuth Initialization (Vercel Version)
 *
 * Redirects user to GitHub OAuth flow to authenticate and authorize
 * repository creation from template.
 */

export default function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // GitHub OAuth configuration
    const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;

    // Use actual current domain (works for both production and preview deployments)
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers['host'];
    const REDIRECT_URI = `${protocol}://${host}/api/github-oauth-callback`;

    if (!GITHUB_CLIENT_ID) {
      return res.status(500).json({
        success: false,
        error: 'GitHub OAuth not configured. Please add GITHUB_CLIENT_ID to environment variables.'
      });
    }

    // Generate random state for CSRF protection
    const state = Math.random().toString(36).substring(2, 15) +
                  Math.random().toString(36).substring(2, 15);

    // GitHub OAuth scopes needed:
    // - public_repo: Create repos from template
    // - codespace: Create and manage Codespaces
    const scopes = 'public_repo codespace';

    // Build OAuth URL
    const githubOAuthUrl = `https://github.com/login/oauth/authorize?` +
      `client_id=${GITHUB_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `state=${state}`;

    return res.status(200).json({
      success: true,
      authUrl: githubOAuthUrl,
      state: state
    });

  } catch (error) {
    console.error('GitHub OAuth init error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
