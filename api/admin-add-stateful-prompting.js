/**
 * Admin Migration: Add Stateful Prompting & Use Case Containers
 *
 * This migration adds:
 * 1. conversation_sessions - tracks each phone call with metadata
 * 2. conversation_history - stores conversation turns/messages
 * 3. use_case_templates - predefined use case configurations
 * 4. student_use_cases - student's active use case selection
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

  // Admin password check
  const adminPassword = req.headers['x-admin-password'] || req.query.password;
  if (adminPassword !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized - Invalid admin password'
    });
  }

  try {
    const migrationSteps = [];

    console.log('🚀 Starting Stateful Prompting & Use Case Containers Migration...');

    // ========================================
    // Step 1: Create conversation_sessions table
    // ========================================
    await sql`
      CREATE TABLE IF NOT EXISTS conversation_sessions (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        session_token TEXT NOT NULL,
        call_sid TEXT,
        from_number TEXT,
        to_number TEXT,
        direction TEXT,
        started_at TIMESTAMP DEFAULT NOW(),
        ended_at TIMESTAMP,
        duration_seconds INTEGER,
        turn_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT fk_session_token
          FOREIGN KEY (session_token)
          REFERENCES student_configs(session_token)
          ON DELETE CASCADE
      )
    `;
    migrationSteps.push('✅ Created conversation_sessions table');

    // Create indexes for conversation_sessions
    await sql`
      CREATE INDEX IF NOT EXISTS idx_conversation_sessions_token
        ON conversation_sessions(session_token)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_conversation_sessions_call_sid
        ON conversation_sessions(call_sid)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_conversation_sessions_started
        ON conversation_sessions(started_at DESC)
    `;
    migrationSteps.push('✅ Created conversation_sessions indexes');

    // ========================================
    // Step 2: Create conversation_history table
    // ========================================
    await sql`
      CREATE TABLE IF NOT EXISTS conversation_history (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        conversation_session_id TEXT NOT NULL,
        turn_number INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT NOW(),
        metadata JSONB DEFAULT '{}',
        CONSTRAINT fk_conversation_session
          FOREIGN KEY (conversation_session_id)
          REFERENCES conversation_sessions(id)
          ON DELETE CASCADE
      )
    `;
    migrationSteps.push('✅ Created conversation_history table');

    // Create indexes for conversation_history
    await sql`
      CREATE INDEX IF NOT EXISTS idx_conversation_history_session
        ON conversation_history(conversation_session_id, turn_number)
    `;
    migrationSteps.push('✅ Created conversation_history indexes');

    // ========================================
    // Step 3: Create use_case_templates table
    // ========================================
    await sql`
      CREATE TABLE IF NOT EXISTS use_case_templates (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        name TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        description TEXT,
        category TEXT,
        icon TEXT,
        system_prompt TEXT NOT NULL,
        greeting TEXT NOT NULL,
        voice TEXT DEFAULT 'alloy',
        sample_tools JSONB DEFAULT '[]',
        configuration JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    migrationSteps.push('✅ Created use_case_templates table');

    // ========================================
    // Step 4: Create student_use_cases table
    // ========================================
    await sql`
      CREATE TABLE IF NOT EXISTS student_use_cases (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        session_token TEXT NOT NULL,
        use_case_template_id TEXT NOT NULL,
        custom_system_prompt TEXT,
        custom_greeting TEXT,
        custom_voice TEXT,
        custom_tools JSONB DEFAULT '[]',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT fk_student_session_token
          FOREIGN KEY (session_token)
          REFERENCES student_configs(session_token)
          ON DELETE CASCADE,
        CONSTRAINT fk_use_case_template
          FOREIGN KEY (use_case_template_id)
          REFERENCES use_case_templates(id)
          ON DELETE CASCADE
      )
    `;
    migrationSteps.push('✅ Created student_use_cases table');

    // Create indexes for student_use_cases
    await sql`
      CREATE INDEX IF NOT EXISTS idx_student_use_cases_token
        ON student_use_cases(session_token)
    `;
    migrationSteps.push('✅ Created student_use_cases indexes');

    // ========================================
    // Step 5: Add use_case_enabled column to student_configs
    // ========================================
    await sql`
      ALTER TABLE student_configs
      ADD COLUMN IF NOT EXISTS use_case_enabled BOOLEAN DEFAULT false
    `;
    await sql`
      ALTER TABLE student_configs
      ADD COLUMN IF NOT EXISTS active_use_case_id TEXT
    `;
    migrationSteps.push('✅ Added use case columns to student_configs');

    // ========================================
    // Step 6: Seed default use case templates
    // ========================================
    const defaultUseCases = [
      {
        name: 'customer_support',
        display_name: 'Customer Support Assistant',
        description: 'Handle customer inquiries, resolve issues, and provide product information',
        category: 'support',
        icon: '🎧',
        system_prompt: `You are a helpful customer support assistant. Your role is to:
- Listen carefully to customer concerns
- Ask clarifying questions when needed
- Provide clear, empathetic responses
- Offer solutions or escalate when appropriate
- Keep responses brief and conversational for voice

Always be polite, professional, and focus on resolving the customer's issue.`,
        greeting: 'Hello! Thank you for contacting customer support. How can I help you today?',
        voice: 'alloy',
        sample_tools: JSON.stringify([
          {
            type: 'function',
            function: {
              name: 'check_order_status',
              description: 'Check the status of a customer order',
              parameters: {
                type: 'object',
                properties: {
                  order_id: {
                    type: 'string',
                    description: 'The order ID to check'
                  }
                },
                required: ['order_id']
              }
            }
          }
        ]),
        configuration: JSON.stringify({
          max_turns: 20,
          enable_summarization: true
        })
      },
      {
        name: 'appointment_booking',
        display_name: 'Appointment Booking Assistant',
        description: 'Schedule appointments, check availability, and manage bookings',
        category: 'scheduling',
        icon: '📅',
        system_prompt: `You are an appointment booking assistant. Your role is to:
- Help customers find available appointment times
- Collect necessary information (name, phone, date, time)
- Confirm appointment details before booking
- Provide booking confirmation
- Keep responses brief and conversational for voice

Always confirm details before finalizing any booking.`,
        greeting: 'Hello! I can help you schedule an appointment. What day would work best for you?',
        voice: 'nova',
        sample_tools: JSON.stringify([
          {
            type: 'function',
            function: {
              name: 'check_availability',
              description: 'Check available appointment slots',
              parameters: {
                type: 'object',
                properties: {
                  date: {
                    type: 'string',
                    description: 'Date to check availability (YYYY-MM-DD)'
                  }
                },
                required: ['date']
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'book_appointment',
              description: 'Book an appointment slot',
              parameters: {
                type: 'object',
                properties: {
                  date: { type: 'string' },
                  time: { type: 'string' },
                  customer_name: { type: 'string' },
                  customer_phone: { type: 'string' }
                },
                required: ['date', 'time', 'customer_name', 'customer_phone']
              }
            }
          }
        ]),
        configuration: JSON.stringify({
          max_turns: 15,
          enable_summarization: false
        })
      },
      {
        name: 'survey_collector',
        display_name: 'Survey & Feedback Collector',
        description: 'Collect customer feedback and conduct surveys',
        category: 'feedback',
        icon: '📊',
        system_prompt: `You are a survey assistant collecting customer feedback. Your role is to:
- Ask survey questions one at a time
- Listen carefully to responses
- Acknowledge each answer before moving to the next question
- Keep responses brief and conversational for voice
- Thank the customer at the end

Be friendly and make the survey feel conversational, not robotic.`,
        greeting: 'Hello! Thank you for taking a few moments to share your feedback. This will only take about 2 minutes.',
        voice: 'shimmer',
        sample_tools: JSON.stringify([]),
        configuration: JSON.stringify({
          max_turns: 10,
          enable_summarization: true
        })
      },
      {
        name: 'restaurant_ordering',
        display_name: 'Restaurant Order Assistant',
        description: 'Take food orders, customize items, and process payments',
        category: 'ordering',
        icon: '🍔',
        system_prompt: `You are a friendly restaurant ordering assistant. Your role is to:
- Present menu options clearly
- Help customers customize their orders
- Confirm order details and calculate total
- Process payment information
- Keep responses brief and conversational for voice

Be enthusiastic about the food and make the ordering experience enjoyable.`,
        greeting: 'Welcome! I can help you place an order. What can I get for you today?',
        voice: 'fable',
        sample_tools: JSON.stringify([
          {
            type: 'function',
            function: {
              name: 'get_menu',
              description: 'Get available menu items',
              parameters: {
                type: 'object',
                properties: {
                  category: {
                    type: 'string',
                    description: 'Menu category (appetizers, entrees, desserts, drinks)'
                  }
                }
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'add_to_order',
              description: 'Add an item to the order',
              parameters: {
                type: 'object',
                properties: {
                  item: { type: 'string' },
                  quantity: { type: 'integer' },
                  customizations: { type: 'array', items: { type: 'string' } }
                },
                required: ['item', 'quantity']
              }
            }
          }
        ]),
        configuration: JSON.stringify({
          max_turns: 20,
          enable_summarization: false
        })
      },
      {
        name: 'general_assistant',
        display_name: 'General AI Assistant',
        description: 'A versatile assistant for general questions and conversations',
        category: 'general',
        icon: '🤖',
        system_prompt: 'You are a helpful voice assistant. Keep responses brief and conversational since they will be spoken aloud.',
        greeting: 'Hello! How can I help you today?',
        voice: 'alloy',
        sample_tools: JSON.stringify([]),
        configuration: JSON.stringify({
          max_turns: 30,
          enable_summarization: true
        })
      }
    ];

    for (const useCase of defaultUseCases) {
      await sql`
        INSERT INTO use_case_templates (
          name, display_name, description, category, icon,
          system_prompt, greeting, voice, sample_tools, configuration
        )
        VALUES (
          ${useCase.name},
          ${useCase.display_name},
          ${useCase.description},
          ${useCase.category},
          ${useCase.icon},
          ${useCase.system_prompt},
          ${useCase.greeting},
          ${useCase.voice},
          ${useCase.sample_tools}::jsonb,
          ${useCase.configuration}::jsonb
        )
        ON CONFLICT (name) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          description = EXCLUDED.description,
          system_prompt = EXCLUDED.system_prompt,
          greeting = EXCLUDED.greeting,
          updated_at = NOW()
      `;
    }
    migrationSteps.push(`✅ Seeded ${defaultUseCases.length} default use case templates`);

    // ========================================
    // Final verification
    // ========================================
    const tableCheck = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'conversation_sessions',
          'conversation_history',
          'use_case_templates',
          'student_use_cases'
        )
      ORDER BY table_name
    `;

    return res.status(200).json({
      success: true,
      message: 'Stateful prompting and use case containers migration completed',
      migrationSteps,
      tablesCreated: tableCheck.map(t => t.table_name),
      useCaseTemplatesSeeded: defaultUseCases.length
    });

  } catch (error) {
    console.error('Migration error:', error);
    return res.status(500).json({
      success: false,
      error: 'Migration failed',
      details: error.message
    });
  }
}
