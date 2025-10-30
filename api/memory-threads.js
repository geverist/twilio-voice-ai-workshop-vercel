/**
 * Memory Threads Management API
 *
 * Manages OpenAI Assistant conversation threads for persistent memory
 * Each phone number gets a unique thread that persists across calls
 *
 * GET /api/memory-threads?sessionToken=xxx - List all threads
 * POST /api/memory-threads - Create/get thread for phone number
 * DELETE /api/memory-threads - Delete specific thread
 */

import postgres from 'postgres';
import { applyCORS, handlePreflightRequest } from './_lib/cors.js';
import { applyRateLimit } from './_lib/ratelimit.js';
import {
  validateRequired,
  validateString,
  handleValidationError
} from './_lib/validation.js';

const sql = postgres(process.env.POSTGRES_URL, {
  ssl: 'require',
  max: 1
});

export default async function handler(req, res) {
  applyCORS(req, res);

  if (handlePreflightRequest(req, res)) {
    return;
  }

  const allowed = await applyRateLimit(req, res);
  if (!allowed) {
    return;
  }

  try {
    if (req.method === 'GET') {
      return await listThreads(req, res);
    } else if (req.method === 'POST') {
      return await getOrCreateThread(req, res);
    } else if (req.method === 'DELETE') {
      return await deleteThread(req, res);
    } else {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Memory threads error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to manage memory threads'
    });
  }
}

/**
 * GET - List all conversation threads for a session
 */
async function listThreads(req, res) {
  const { sessionToken } = req.query;

  try {
    validateRequired({ sessionToken }, ['sessionToken']);
    validateString(sessionToken, 'sessionToken', { minLength: 10, maxLength: 200 });
  } catch (validationError) {
    return handleValidationError(validationError, res);
  }

  // Ensure table exists
  await sql`
    CREATE TABLE IF NOT EXISTS conversation_threads (
      id SERIAL PRIMARY KEY,
      session_token VARCHAR(255) NOT NULL,
      phone_number VARCHAR(20) NOT NULL,
      thread_id VARCHAR(255) NOT NULL,
      assistant_id VARCHAR(255),
      message_count INTEGER DEFAULT 0,
      last_interaction TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(session_token, phone_number)
    )
  `;

  const threads = await sql`
    SELECT
      phone_number,
      thread_id,
      assistant_id,
      message_count,
      last_interaction,
      created_at
    FROM conversation_threads
    WHERE session_token = ${sessionToken}
    ORDER BY last_interaction DESC
  `;

  return res.status(200).json({
    success: true,
    threads: threads,
    totalThreads: threads.length
  });
}

/**
 * POST - Get or create thread for a phone number
 */
async function getOrCreateThread(req, res) {
  const { sessionToken, phoneNumber, assistantId, openaiApiKey } = req.body;

  try {
    validateRequired(req.body, ['sessionToken', 'phoneNumber', 'openaiApiKey']);
    validateString(sessionToken, 'sessionToken', { minLength: 10, maxLength: 200 });
    validateString(phoneNumber, 'phoneNumber', { minLength: 10, maxLength: 20 });
    validateString(openaiApiKey, 'openaiApiKey', { minLength: 20, maxLength: 200 });
  } catch (validationError) {
    return handleValidationError(validationError, res);
  }

  // Ensure table exists
  await sql`
    CREATE TABLE IF NOT EXISTS conversation_threads (
      id SERIAL PRIMARY KEY,
      session_token VARCHAR(255) NOT NULL,
      phone_number VARCHAR(20) NOT NULL,
      thread_id VARCHAR(255) NOT NULL,
      assistant_id VARCHAR(255),
      message_count INTEGER DEFAULT 0,
      last_interaction TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(session_token, phone_number)
    )
  `;

  // Check if thread already exists for this phone number
  const existing = await sql`
    SELECT thread_id, assistant_id, message_count
    FROM conversation_threads
    WHERE session_token = ${sessionToken}
    AND phone_number = ${phoneNumber}
  `;

  if (existing.length > 0) {
    // Update last interaction timestamp
    await sql`
      UPDATE conversation_threads
      SET last_interaction = NOW(),
          message_count = message_count + 1
      WHERE session_token = ${sessionToken}
      AND phone_number = ${phoneNumber}
    `;

    console.log(`✅ Existing thread found for ${phoneNumber}: ${existing[0].thread_id}`);

    return res.status(200).json({
      success: true,
      threadId: existing[0].thread_id,
      assistantId: existing[0].assistant_id,
      messageCount: existing[0].message_count + 1,
      isNew: false
    });
  }

  // Create new OpenAI thread
  console.log('🔄 Creating new OpenAI thread for', phoneNumber);

  const threadResponse = await fetch('https://api.openai.com/v1/threads', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v2'
    },
    body: JSON.stringify({
      metadata: {
        phone_number: phoneNumber,
        session_token: sessionToken
      }
    })
  });

  if (!threadResponse.ok) {
    const error = await threadResponse.text();
    throw new Error(`OpenAI thread creation failed: ${error}`);
  }

  const threadData = await threadResponse.json();
  const threadId = threadData.id;

  // Save to database
  await sql`
    INSERT INTO conversation_threads (
      session_token,
      phone_number,
      thread_id,
      assistant_id,
      message_count,
      last_interaction,
      created_at
    ) VALUES (
      ${sessionToken},
      ${phoneNumber},
      ${threadId},
      ${assistantId || null},
      1,
      NOW(),
      NOW()
    )
  `;

  console.log(`✅ Created new thread for ${phoneNumber}: ${threadId}`);

  return res.status(200).json({
    success: true,
    threadId: threadId,
    assistantId: assistantId,
    messageCount: 1,
    isNew: true
  });
}

/**
 * DELETE - Delete a conversation thread
 */
async function deleteThread(req, res) {
  const { sessionToken, phoneNumber, openaiApiKey } = req.body;

  try {
    validateRequired(req.body, ['sessionToken', 'phoneNumber']);
    validateString(sessionToken, 'sessionToken', { minLength: 10, maxLength: 200 });
    validateString(phoneNumber, 'phoneNumber', { minLength: 10, maxLength: 20 });
  } catch (validationError) {
    return handleValidationError(validationError, res);
  }

  // Get thread ID
  const thread = await sql`
    SELECT thread_id
    FROM conversation_threads
    WHERE session_token = ${sessionToken}
    AND phone_number = ${phoneNumber}
  `;

  if (thread.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'Thread not found'
    });
  }

  const threadId = thread[0].thread_id;

  // Delete from OpenAI if API key provided
  if (openaiApiKey) {
    try {
      await fetch(`https://api.openai.com/v1/threads/${threadId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'OpenAI-Beta': 'assistants=v2'
        }
      });
      console.log(`✅ Deleted OpenAI thread: ${threadId}`);
    } catch (error) {
      console.warn('⚠️ Failed to delete OpenAI thread:', error.message);
    }
  }

  // Delete from database
  await sql`
    DELETE FROM conversation_threads
    WHERE session_token = ${sessionToken}
    AND phone_number = ${phoneNumber}
  `;

  console.log(`✅ Deleted thread for ${phoneNumber}`);

  return res.status(200).json({
    success: true,
    message: 'Thread deleted successfully'
  });
}
