// Cleanup expired sessions - Run via cron job
// Vercel Cron: Add to vercel.json

import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  // Only allow cron job or manual trigger with secret
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET || 'changeme';

  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Clean up expired sessions
    const result = await sql`SELECT cleanup_expired_sessions()`;
    const deletedCount = result.rows[0].cleanup_expired_sessions;

    // Log cleanup event
    await sql`
      INSERT INTO workshop_events (
        event_type,
        event_data,
        created_at
      ) VALUES (
        'sessions_cleaned',
        ${JSON.stringify({ deletedCount })},
        NOW()
      )
    `;

    return res.status(200).json({
      success: true,
      deletedSessions: deletedCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
