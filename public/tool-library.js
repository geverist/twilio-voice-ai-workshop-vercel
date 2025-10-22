/**
 * Pre-built Tool Library
 *
 * Contains ready-to-use functions for common Voice AI use cases
 * Each tool includes:
 * - OpenAI function schema
 * - Implementation code sample
 * - Use case tags
 */

const TOOL_LIBRARY = {
  // ===================================================================
  // UNIVERSAL TOOLS (work for all use cases)
  // ===================================================================

  sendSMS: {
    id: 'send_sms',
    name: 'Send SMS Confirmation',
    description: 'Send a text message confirmation to the caller',
    tags: ['universal', 'healthcare', 'restaurant', 'retail', 'support'],
    icon: '📱',

    // OpenAI Function Schema
    openaiSchema: {
      type: 'function',
      function: {
        name: 'send_sms',
        description: 'Send an SMS text message to a phone number',
        parameters: {
          type: 'object',
          properties: {
            to: {
              type: 'string',
              description: 'The phone number to send to (E.164 format, e.g., +12125551234)'
            },
            message: {
              type: 'string',
              description: 'The message content to send'
            }
          },
          required: ['to', 'message']
        }
      }
    },

    // Code implementation
    codeImplementation: `async function sendSMS(to, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  const response = await fetch(
    \`https://api.twilio.com/2010-04-01/Accounts/\${accountSid}/Messages.json\`,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(\`\${accountSid}:\${authToken}\`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        To: to,
        From: fromNumber,
        Body: message
      })
    }
  );

  const data = await response.json();
  return {
    success: response.ok,
    messageSid: data.sid,
    status: data.status
  };
}`
  },

  // ===================================================================
  // HEALTHCARE TOOLS
  // ===================================================================

  checkAvailability: {
    id: 'check_availability',
    name: 'Check Appointment Availability',
    description: 'Check available appointment time slots',
    tags: ['healthcare'],
    icon: '🗓️',

    openaiSchema: {
      type: 'function',
      function: {
        name: 'check_availability',
        description: 'Check available appointment slots for a given date',
        parameters: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              description: 'The date to check (YYYY-MM-DD format)'
            },
            service_type: {
              type: 'string',
              description: 'Type of appointment (e.g., checkup, consultation)',
              enum: ['checkup', 'consultation', 'follow-up', 'emergency']
            }
          },
          required: ['date']
        }
      }
    },

    codeImplementation: `async function checkAvailability(date, serviceType = 'checkup') {
  // In production, this would query your scheduling database
  // For demo, return mock available slots

  const availableSlots = [
    { time: '09:00 AM', duration: '30 min' },
    { time: '10:30 AM', duration: '30 min' },
    { time: '02:00 PM', duration: '30 min' },
    { time: '03:30 PM', duration: '30 min' }
  ];

  return {
    date: date,
    serviceType: serviceType,
    availableSlots: availableSlots,
    timezone: 'America/New_York'
  };
}`
  },

  bookAppointment: {
    id: 'book_appointment',
    name: 'Book Appointment',
    description: 'Schedule a patient appointment',
    tags: ['healthcare'],
    icon: '📅',

    openaiSchema: {
      type: 'function',
      function: {
        name: 'book_appointment',
        description: 'Book an appointment for a patient',
        parameters: {
          type: 'object',
          properties: {
            patient_name: {
              type: 'string',
              description: 'Patient full name'
            },
            phone: {
              type: 'string',
              description: 'Patient phone number'
            },
            date: {
              type: 'string',
              description: 'Appointment date (YYYY-MM-DD)'
            },
            time: {
              type: 'string',
              description: 'Appointment time (HH:MM AM/PM)'
            },
            service_type: {
              type: 'string',
              description: 'Type of appointment'
            }
          },
          required: ['patient_name', 'phone', 'date', 'time']
        }
      }
    },

    codeImplementation: `async function bookAppointment(patientName, phone, date, time, serviceType = 'checkup') {
  // In production, this would save to your database
  // For demo, return confirmation

  const appointmentId = 'APT-' + Date.now();

  // You could also send confirmation SMS here
  // await sendSMS(phone, \`Confirmed: \${serviceType} on \${date} at \${time}\`);

  return {
    success: true,
    appointmentId: appointmentId,
    patientName: patientName,
    phone: phone,
    date: date,
    time: time,
    serviceType: serviceType,
    status: 'confirmed'
  };
}`
  },

  // ===================================================================
  // RESTAURANT TOOLS
  // ===================================================================

  checkTableAvailability: {
    id: 'check_table_availability',
    name: 'Check Table Availability',
    description: 'Check available reservation times',
    tags: ['restaurant'],
    icon: '🍽️',

    openaiSchema: {
      type: 'function',
      function: {
        name: 'check_table_availability',
        description: 'Check available table reservations',
        parameters: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              description: 'The date to check (YYYY-MM-DD)'
            },
            party_size: {
              type: 'number',
              description: 'Number of guests'
            },
            time_preference: {
              type: 'string',
              description: 'Preferred time (breakfast, lunch, dinner)'
            }
          },
          required: ['date', 'party_size']
        }
      }
    },

    codeImplementation: `async function checkTableAvailability(date, partySize, timePreference = 'dinner') {
  // In production, query your reservation system
  // For demo, return mock availability

  const availableTimes = [
    { time: '05:30 PM', tableType: 'Standard' },
    { time: '07:00 PM', tableType: 'Window seat' },
    { time: '08:30 PM', tableType: 'Standard' }
  ];

  return {
    date: date,
    partySize: partySize,
    availableTimes: availableTimes
  };
}`
  },

  makeReservation: {
    id: 'make_reservation',
    name: 'Make Reservation',
    description: 'Book a table reservation',
    tags: ['restaurant'],
    icon: '📋',

    openaiSchema: {
      type: 'function',
      function: {
        name: 'make_reservation',
        description: 'Create a restaurant reservation',
        parameters: {
          type: 'object',
          properties: {
            guest_name: {
              type: 'string',
              description: 'Guest name'
            },
            phone: {
              type: 'string',
              description: 'Contact phone number'
            },
            date: {
              type: 'string',
              description: 'Reservation date (YYYY-MM-DD)'
            },
            time: {
              type: 'string',
              description: 'Reservation time'
            },
            party_size: {
              type: 'number',
              description: 'Number of guests'
            },
            special_requests: {
              type: 'string',
              description: 'Any special requests'
            }
          },
          required: ['guest_name', 'phone', 'date', 'time', 'party_size']
        }
      }
    },

    codeImplementation: `async function makeReservation(guestName, phone, date, time, partySize, specialRequests = '') {
  // In production, save to database
  const reservationId = 'RES-' + Date.now();

  return {
    success: true,
    reservationId: reservationId,
    guestName: guestName,
    phone: phone,
    date: date,
    time: time,
    partySize: partySize,
    specialRequests: specialRequests,
    status: 'confirmed'
  };
}`
  },

  // ===================================================================
  // RETAIL TOOLS
  // ===================================================================

  trackOrder: {
    id: 'track_order',
    name: 'Track Order',
    description: 'Look up order status by order number',
    tags: ['retail'],
    icon: '📦',

    openaiSchema: {
      type: 'function',
      function: {
        name: 'track_order',
        description: 'Track an order by order number',
        parameters: {
          type: 'object',
          properties: {
            order_number: {
              type: 'string',
              description: 'The order number to track'
            }
          },
          required: ['order_number']
        }
      }
    },

    codeImplementation: `async function trackOrder(orderNumber) {
  // In production, query your order management system
  // For demo, return mock tracking info

  return {
    orderNumber: orderNumber,
    status: 'In Transit',
    estimatedDelivery: '2024-10-25',
    trackingNumber: 'TRK' + orderNumber,
    currentLocation: 'Distribution Center - New York, NY',
    items: [
      { name: 'Product A', quantity: 2 },
      { name: 'Product B', quantity: 1 }
    ]
  };
}`
  },

  processReturn: {
    id: 'process_return',
    name: 'Process Return',
    description: 'Initiate a product return request',
    tags: ['retail'],
    icon: '🔄',

    openaiSchema: {
      type: 'function',
      function: {
        name: 'process_return',
        description: 'Process a product return',
        parameters: {
          type: 'object',
          properties: {
            order_number: {
              type: 'string',
              description: 'Original order number'
            },
            reason: {
              type: 'string',
              description: 'Reason for return'
            },
            items: {
              type: 'array',
              description: 'Items to return',
              items: { type: 'string' }
            }
          },
          required: ['order_number', 'reason']
        }
      }
    },

    codeImplementation: `async function processReturn(orderNumber, reason, items = []) {
  // In production, create return in your system
  const returnId = 'RET-' + Date.now();

  return {
    success: true,
    returnId: returnId,
    orderNumber: orderNumber,
    reason: reason,
    items: items,
    returnLabel: 'https://example.com/return-label/' + returnId,
    status: 'initiated'
  };
}`
  },

  // ===================================================================
  // SUPPORT TOOLS
  // ===================================================================

  createTicket: {
    id: 'create_ticket',
    name: 'Create Support Ticket',
    description: 'Generate a support ticket from the call',
    tags: ['support'],
    icon: '🎫',

    openaiSchema: {
      type: 'function',
      function: {
        name: 'create_ticket',
        description: 'Create a support ticket',
        parameters: {
          type: 'object',
          properties: {
            customer_name: {
              type: 'string',
              description: 'Customer name'
            },
            issue_description: {
              type: 'string',
              description: 'Description of the issue'
            },
            priority: {
              type: 'string',
              description: 'Ticket priority',
              enum: ['low', 'medium', 'high', 'urgent']
            },
            category: {
              type: 'string',
              description: 'Issue category'
            }
          },
          required: ['customer_name', 'issue_description']
        }
      }
    },

    codeImplementation: `async function createTicket(customerName, issueDescription, priority = 'medium', category = 'general') {
  // In production, create ticket in your helpdesk system
  const ticketId = 'TKT-' + Date.now();

  return {
    success: true,
    ticketId: ticketId,
    customerName: customerName,
    issueDescription: issueDescription,
    priority: priority,
    category: category,
    status: 'open',
    createdAt: new Date().toISOString()
  };
}`
  },

  lookupAccount: {
    id: 'lookup_account',
    name: 'Look Up Customer Account',
    description: 'Retrieve customer account information',
    tags: ['support'],
    icon: '🔍',

    openaiSchema: {
      type: 'function',
      function: {
        name: 'lookup_account',
        description: 'Look up customer account details',
        parameters: {
          type: 'object',
          properties: {
            identifier: {
              type: 'string',
              description: 'Account identifier (email, phone, or account number)'
            }
          },
          required: ['identifier']
        }
      }
    },

    codeImplementation: `async function lookupAccount(identifier) {
  // In production, query your CRM database
  // For demo, return mock account info

  return {
    accountId: 'ACC-12345',
    customerName: 'John Doe',
    email: 'john@example.com',
    phone: identifier,
    accountStatus: 'active',
    memberSince: '2023-01-15',
    recentOrders: 3,
    totalSpent: '$1,247.50'
  };
}`
  }
};

/**
 * Get tools filtered by use case tags
 */
function getToolsByUseCase(useCaseDescription) {
  const desc = useCaseDescription.toLowerCase();
  const tools = [];

  // Always include universal tools
  tools.push(TOOL_LIBRARY.sendSMS);

  // Add use-case specific tools
  if (/health|medical|doctor|patient|appointment/.test(desc)) {
    tools.push(TOOL_LIBRARY.checkAvailability, TOOL_LIBRARY.bookAppointment);
  }

  if (/restaurant|food|reservation|table|dining/.test(desc)) {
    tools.push(TOOL_LIBRARY.checkTableAvailability, TOOL_LIBRARY.makeReservation);
  }

  if (/shop|store|product|order|retail/.test(desc)) {
    tools.push(TOOL_LIBRARY.trackOrder, TOOL_LIBRARY.processReturn);
  }

  if (/support|help|ticket|technical/.test(desc)) {
    tools.push(TOOL_LIBRARY.createTicket, TOOL_LIBRARY.lookupAccount);
  }

  return tools;
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TOOL_LIBRARY, getToolsByUseCase };
}
