/**
 * Use Cases List API
 *
 * GET /api/use-cases-list
 * Returns all available use case templates for students to choose from
 */

import postgres from 'postgres';
import { applyCORS, handlePreflightRequest } from './_lib/cors.js';

const sql = postgres(process.env.POSTGRES_URL, {
  ssl: 'require',
  max: 1
});

export default async function handler(req, res) {
  // Apply CORS
  applyCORS(req, res);

  // Handle preflight
  if (handlePreflightRequest(req, res)) {
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    // Check if Postgres is configured
    if (!process.env.POSTGRES_URL) {
      return res.status(500).json({
        success: false,
        error: 'Database not configured'
      });
    }

    // Get all active use case templates
    const useCases = await sql`
      SELECT
        id,
        name,
        display_name as "displayName",
        description,
        category,
        icon,
        system_prompt as "systemPrompt",
        greeting,
        voice,
        sample_tools as "sampleTools",
        configuration,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM use_case_templates
      WHERE is_active = true
      ORDER BY category, display_name
    `;

    return res.status(200).json({
      success: true,
      useCases,
      count: useCases.length
    });

  } catch (error) {
    console.error('Error fetching use case templates:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch use case templates',
      details: error.message
    });
  }
}
