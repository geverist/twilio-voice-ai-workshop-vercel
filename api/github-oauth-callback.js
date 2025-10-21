/**
 * GitHub OAuth Callback Handler (Vercel Version)
 *
 * Handles the redirect from GitHub after user authorizes.
 * Exchanges authorization code for access token.
 */

export default async function handler(req, res) {
  try {
    const { code, state } = req.query;

    if (!code) {
      // Redirect to tutorial with error
      return res.redirect(302, `/index.html?error=no_code`);
    }

    // GitHub OAuth configuration
    const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID?.trim();
    const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET?.trim();

    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
      return res.redirect(302, `/index.html?error=config`);
    }

    // Exchange code for access token
    const tokenResponse = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code: code
        })
      }
    );

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return res.redirect(302, `/index.html?error=no_token`);
    }

    // Get user info from GitHub
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    const userData = await userResponse.json();
    const githubUsername = userData.login;

    // For simplified Vercel version, pass token directly in URL
    // In production, you'd store in session (Redis/Vercel KV)
    // and pass a session ID instead

    // Encode token for URL safety
    const encodedToken = Buffer.from(accessToken).toString('base64');

    // Redirect to workshop with GitHub credentials
    return res.redirect(302,
      `/index.html?github_token=${encodedToken}&github_user=${githubUsername}`
    );

  } catch (error) {
    console.error('GitHub OAuth callback error:', error);
    return res.redirect(302, `/index.html?error=oauth_failed`);
  }
}
