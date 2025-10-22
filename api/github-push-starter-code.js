/**
 * GitHub Push Starter Code API
 *
 * Creates a GitHub repository for the student and pushes the ConversationRelay starter pack.
 * This gives students their own codebase to learn from and deploy later.
 */

import { applyCORS, handlePreflightRequest } from './_lib/cors.js';
import { applyRateLimit } from './_lib/ratelimit.js';
import {
  validateRequired,
  validateString,
  handleValidationError
} from './_lib/validation.js';

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

  // Apply rate limiting
  const allowed = await applyRateLimit(req, res);
  if (!allowed) {
    return;
  }

  try {
    const {
      githubToken,
      githubUsername,
      repoName
    } = req.body;

    // Input validation
    try {
      validateRequired(req.body, ['githubToken', 'githubUsername', 'repoName']);
      validateString(githubToken, 'githubToken', { minLength: 20, maxLength: 500 });
      validateString(githubUsername, 'githubUsername', { minLength: 1, maxLength: 100 });
      validateString(repoName, 'repoName', { minLength: 1, maxLength: 100 });
    } catch (validationError) {
      return handleValidationError(validationError, res);
    }

    console.log(`Creating repository: ${githubUsername}/${repoName}`);

    // Step 1: Check if repo already exists
    const checkResponse = await fetch(
      `https://api.github.com/repos/${githubUsername}/${repoName}`,
      {
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }
    );

    if (checkResponse.ok) {
      // Repo exists
      return res.status(200).json({
        success: true,
        repoName: repoName,
        repoUrl: `https://github.com/${githubUsername}/${repoName}`,
        message: 'Repository already exists'
      });
    }

    // Step 2: Create repository
    const createResponse = await fetch(
      'https://api.github.com/user/repos',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: repoName,
          description: 'ConversationRelay Voice AI - Built in Twilio Workshop',
          private: false,
          auto_init: true
        })
      }
    );

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Failed to create repository: ${errorText}`);
    }

    const repoData = await createResponse.json();
    console.log(`✅ Created repository: ${repoData.html_url}`);

    // Step 3: Get starter pack files from the template repo
    const starterFiles = await getStarterPackFiles();

    // Step 4: Push files to the new repository
    await pushFilesToRepo(githubToken, githubUsername, repoName, starterFiles);

    console.log(`✅ Pushed starter code to ${githubUsername}/${repoName}`);

    return res.status(200).json({
      success: true,
      repoName: repoName,
      repoUrl: repoData.html_url,
      message: 'Repository created and starter code pushed'
    });

  } catch (error) {
    console.error('GitHub push error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to push starter code'
    });
  }
}

/**
 * Get starter pack files from the conversationrelay-starter-pack directory
 */
async function getStarterPackFiles() {
  const fs = await import('fs/promises');
  const path = await import('path');

  const starterPackPath = path.join(process.cwd(), '..', 'conversationrelay-starter-pack');

  const files = {};

  // Read all files from the starter pack
  async function readDirectory(dir, baseDir = '') {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.join(baseDir, entry.name);

      // Skip node_modules, .git, and hidden files
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('.')) {
        continue;
      }

      if (entry.isDirectory()) {
        await readDirectory(fullPath, relativePath);
      } else {
        const content = await fs.readFile(fullPath, 'utf-8');
        files[relativePath] = content;
      }
    }
  }

  await readDirectory(starterPackPath);

  return files;
}

/**
 * Push files to GitHub repository
 */
async function pushFilesToRepo(token, username, repoName, files) {
  // Get the default branch SHA
  const refResponse = await fetch(
    `https://api.github.com/repos/${username}/${repoName}/git/refs/heads/main`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }
  );

  if (!refResponse.ok) {
    throw new Error('Failed to get branch reference');
  }

  const refData = await refResponse.json();
  const latestCommitSha = refData.object.sha;

  // Get the tree of the latest commit
  const commitResponse = await fetch(
    `https://api.github.com/repos/${username}/${repoName}/git/commits/${latestCommitSha}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }
  );

  const commitData = await commitResponse.json();
  const baseTreeSha = commitData.tree.sha;

  // Create blobs for each file
  const tree = [];
  for (const [path, content] of Object.entries(files)) {
    const blobResponse = await fetch(
      `https://api.github.com/repos/${username}/${repoName}/git/blobs`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: content,
          encoding: 'utf-8'
        })
      }
    );

    const blobData = await blobResponse.json();

    tree.push({
      path: path,
      mode: '100644',
      type: 'blob',
      sha: blobData.sha
    });
  }

  // Create new tree
  const treeResponse = await fetch(
    `https://api.github.com/repos/${username}/${repoName}/git/trees`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: tree
      })
    }
  );

  const treeData = await treeResponse.json();

  // Create new commit
  const newCommitResponse = await fetch(
    `https://api.github.com/repos/${username}/${repoName}/git/commits`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Add ConversationRelay starter code',
        tree: treeData.sha,
        parents: [latestCommitSha]
      })
    }
  );

  const newCommitData = await newCommitResponse.json();

  // Update reference
  await fetch(
    `https://api.github.com/repos/${username}/${repoName}/git/refs/heads/main`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sha: newCommitData.sha,
        force: false
      })
    }
  );
}
