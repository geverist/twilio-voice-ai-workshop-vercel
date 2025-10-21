/**
 * Submit Feedback API (Vercel Version)
 *
 * Handles feedback submissions from workshop participants
 */

import { applyCORS, handlePreflightRequest } from './_lib/cors.js';
import { applyRateLimit } from './_lib/ratelimit.js';
import {
  validateRequired,
  validateString,
  validateNumber,
  handleValidationError,
  sanitizeString
} from './_lib/validation.js';

export default async function handler(req, res) {
  // Apply CORS
  applyCORS(req, res);

  // Handle preflight
  if (handlePreflightRequest(req, res)) {
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  // Apply rate limiting
  const allowed = await applyRateLimit(req, res);
  if (!allowed) {
    return;
  }

  try {
    const {
      name,
      message,
      rating,
      completedSteps,
      timestamp,
      context
    } = req.body;

    // Input validation
    try {
      validateRequired(req.body, ['message']);
      validateString(message, 'message', { minLength: 1, maxLength: 5000 });

      if (name) {
        validateString(name, 'name', { maxLength: 200 });
      }

      if (rating !== undefined) {
        validateNumber(rating, 'rating', { min: 1, max: 5, integer: true });
      }

      if (completedSteps !== undefined) {
        validateNumber(completedSteps, 'completedSteps', { min: 0, max: 20, integer: true });
      }
    } catch (validationError) {
      return handleValidationError(validationError, res);
    }

    // Sanitize user inputs for logging
    const safeName = name ? sanitizeString(name) : 'Anonymous';
    const safeMessage = sanitizeString(message);

    // Log feedback to console (in production, you'd save to database/send email/etc)
    console.log('==================== WORKSHOP FEEDBACK ====================');
    console.log('Timestamp:', timestamp);
    console.log('Name:', safeName);
    console.log('Rating:', rating ? `${rating}/5 stars` : 'Not provided');
    console.log('Completed Steps:', completedSteps);
    console.log('Message:', safeMessage);
    console.log('Context:', JSON.stringify(context, null, 2));
    console.log('==========================================================');

    // TODO: In production, save to database or send notification
    // Examples:
    // - Save to Airtable/Google Sheets
    // - Send email notification
    // - Post to Slack/Discord webhook
    // - Save to database

    // For now, just acknowledge receipt
    return res.status(200).json({
      success: true,
      message: 'Thank you for your feedback! We really appreciate it.'
    });

  } catch (error) {
    console.error('Feedback submission error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to submit feedback'
    });
  }
}
