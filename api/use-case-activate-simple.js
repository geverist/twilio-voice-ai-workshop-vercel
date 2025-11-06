/**
 * Use Case Activate API (Simple Version)
 *
 * Activates a use case template from the static library.
 * Updates student configuration directly without requiring additional database tables.
 *
 * POST /api/use-case-activate-simple
 * Body: { sessionToken, useCaseId, customizations? }
 */

export const config = {
  runtime: 'nodejs'
};

import postgres from 'postgres';
import { applyCORS, handlePreflightRequest } from './_lib/cors.js';

const sql = postgres(process.env.POSTGRES_URL, {
  ssl: 'require',
  max: 1
});

// Import the use cases library (same data as API endpoint)
const USE_CASES = [
  {
    id: 'customer-support-ecommerce',
    displayName: 'E-Commerce Support',
    callDirection: 'inbound'
  },
  {
    id: 'tech-support-helpdesk',
    displayName: 'IT Help Desk',
    callDirection: 'inbound'
  },
  {
    id: 'appointment-medical',
    displayName: 'Medical Appointment Booking',
    callDirection: 'inbound'
  },
  {
    id: 'appointment-salon',
    displayName: 'Salon & Spa Booking',
    callDirection: 'inbound'
  },
  {
    id: 'sales-real-estate',
    displayName: 'Real Estate Lead Qualifier',
    callDirection: 'outbound'
  },
  {
    id: 'sales-saas-demo',
    displayName: 'SaaS Demo Scheduler',
    callDirection: 'outbound'
  },
  {
    id: 'survey-customer-satisfaction',
    displayName: 'Customer Satisfaction Survey',
    callDirection: 'outbound'
  },
  {
    id: 'restaurant-reservations',
    displayName: 'Restaurant Reservations',
    callDirection: 'inbound'
  },
  {
    id: 'hotel-concierge',
    displayName: 'Hotel Concierge',
    callDirection: 'inbound'
  },
  {
    id: 'banking-account-info',
    displayName: 'Banking Assistant',
    callDirection: 'inbound'
  },
  {
    id: 'prescription-refill',
    displayName: 'Prescription Refill Line',
    callDirection: 'inbound'
  },
  {
    id: 'utility-billing',
    displayName: 'Utility Billing Support',
    callDirection: 'inbound'
  },
  {
    id: 'university-admissions',
    displayName: 'University Admissions',
    callDirection: 'inbound'
  },
  {
    id: 'auto-service-appointment',
    displayName: 'Auto Service Scheduler',
    callDirection: 'inbound'
  },
  {
    id: 'retail-store-locator',
    displayName: 'Store Locator & Hours',
    callDirection: 'inbound'
  },
  {
    id: 'insurance-claims',
    displayName: 'Insurance Claims Support',
    callDirection: 'inbound'
  },
  {
    id: 'travel-booking',
    displayName: 'Travel Booking Agent',
    callDirection: 'inbound'
  }
];

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

  try {
    const { sessionToken, useCaseId, customizations } = req.body;

    // Validation
    if (!sessionToken) {
      return res.status(400).json({ success: false, error: 'sessionToken is required' });
    }

    if (!useCaseId) {
      return res.status(400).json({ success: false, error: 'useCaseId is required' });
    }

    console.log(`🎯 Activating use case: ${useCaseId} for session: ${sessionToken.substring(0, 20)}...`);

    // Fetch the use case from the library API
    const libraryResponse = await fetch(`${req.headers.host?.startsWith('localhost') ? 'http' : 'https'}://${req.headers.host}/api/use-cases-library`);
    const libraryData = await libraryResponse.json();

    if (!libraryData.success) {
      return res.status(500).json({ success: false, error: 'Failed to load use cases library' });
    }

    const useCase = libraryData.useCases.find(uc => uc.id === useCaseId);

    if (!useCase) {
      return res.status(404).json({ success: false, error: 'Use case not found in library' });
    }

    // Prepare the values to save (use customizations if provided, otherwise use template defaults)
    const systemPrompt = customizations?.systemPrompt || useCase.systemPrompt;
    const greeting = customizations?.greeting || useCase.greeting;
    const voice = customizations?.voice || useCase.voice;
    const ttsProvider = useCase.ttsProvider || 'elevenlabs';
    const tools = customizations?.tools || (useCase.sampleTools ? JSON.parse(useCase.sampleTools) : []);
    const callDirection = useCase.callDirection;
    const useCaseDescription = useCase.description;

    // Update student_configs with the use case settings
    await sql`
      UPDATE student_configs
      SET
        system_prompt = ${systemPrompt},
        ivr_greeting = ${greeting},
        selected_voice = ${voice},
        tts_provider = ${ttsProvider},
        tools = ${JSON.stringify(tools)},
        call_direction = ${callDirection},
        use_case_description = ${useCaseDescription},
        call_direction_chosen = true,
        updated_at = NOW()
      WHERE session_token = ${sessionToken}
    `;

    console.log(`✅ Use case activated: ${useCase.displayName}`);

    return res.status(200).json({
      success: true,
      message: `Successfully activated "${useCase.displayName}"! Your configuration has been updated.`,
      appliedSettings: {
        useCaseName: useCase.displayName,
        callDirection: callDirection,
        systemPrompt: systemPrompt.substring(0, 100) + '...',
        greeting: greeting,
        voice: voice,
        toolsCount: tools.length
      }
    });

  } catch (error) {
    console.error('Use case activation error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to activate use case'
    });
  }
}
