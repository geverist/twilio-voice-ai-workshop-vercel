// =========================================================================
// CONVERSATION PHASES MANAGEMENT (Admin Panel Integration)
// =========================================================================

// Global state for conversation phases
let adminConversationPhases = [];
let adminPhaseIdCounter = 1;

/**
 * Initialize conversation phases UI in admin panel
 */
function initializeConversationPhases() {
  // Load conversation phases from config
  if (config.conversationPhases) {
    try {
      adminConversationPhases = typeof config.conversationPhases === 'string'
        ? JSON.parse(config.conversationPhases)
        : config.conversationPhases;

      // Set counter to highest existing ID + 1
      if (adminConversationPhases.length > 0) {
        const maxId = Math.max(...adminConversationPhases.map(p => {
          const match = p.id.match(/phase-(\d+)/);
          return match ? parseInt(match[1]) : 0;
        }));
        adminPhaseIdCounter = maxId + 1;
      }
    } catch (e) {
      console.error('Failed to parse conversation phases:', e);
      adminConversationPhases = [];
    }
  }

  renderAdminPhases();
}

/**
 * Render admin conversation phases
 */
function renderAdminPhases() {
  const container = document.getElementById('adminPhasesContainer');
  if (!container) return;

  if (adminConversationPhases.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">No phases defined. Load a template or add a custom phase.</div>';
    return;
  }

  container.innerHTML = adminConversationPhases.map((phase, index) => {
    const colors = ['#4ade80', '#60a5fa', '#f59e0b', '#a78bfa', '#ec4899'];
    const color = colors[index % colors.length];

    return `
      <div class="setting-card" style="margin-bottom: 15px; border-left: 4px solid ${color};">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px;">
          <div style="flex: 1;">
            <h3 style="margin: 0 0 5px 0; color: ${color};">
              ${phase.number}. ${phase.name}
            </h3>
            <p style="color: #666; font-size: 13px; margin: 0;">${phase.description || 'No description'}</p>
          </div>
          <div style="display: flex; gap: 10px;">
            <button onclick="editAdminPhase(${index})" style="padding: 6px 12px; font-size: 12px; cursor: pointer; background: #667eea; color: white; border: none; border-radius: 4px;">
              ✏️ Edit
            </button>
            <button onclick="deleteAdminPhase(${index})" style="padding: 6px 12px; font-size: 12px; cursor: pointer; background: #ef4444; color: white; border: none; border-radius: 4px;">
              🗑️ Delete
            </button>
          </div>
        </div>

        <!-- Phase Details -->
        <div style="margin-top: 10px;">
          <details>
            <summary style="cursor: pointer; color: #667eea; font-size: 13px; font-weight: 600;">View Phase Details</summary>
            <div style="margin-top: 10px; padding: 15px; background: #f8f9fa; border-radius: 6px;">
              <div style="margin-bottom: 10px;">
                <strong style="font-size: 12px; color: #666;">Instructions:</strong>
                <div style="font-size: 13px; color: #333; margin-top: 5px; white-space: pre-wrap;">${phase.instructions || 'None'}</div>
              </div>
              ${phase.gateConditions ? `
                <div>
                  <strong style="font-size: 12px; color: #666;">Gate Conditions:</strong>
                  <div style="font-size: 13px; color: #333; margin-top: 5px;">${phase.gateConditions}</div>
                </div>
              ` : ''}
            </div>
          </details>
        </div>
      </div>
    `;
  }).join('');

  renderAdminPhaseFlowVisualization();
}

/**
 * Render phase flow visualization
 */
function renderAdminPhaseFlowVisualization() {
  const vizContainer = document.getElementById('adminPhaseFlowViz');
  if (!vizContainer) return;

  if (adminConversationPhases.length === 0) {
    vizContainer.style.display = 'none';
    return;
  }

  vizContainer.style.display = 'block';

  const colors = ['#4ade80', '#60a5fa', '#f59e0b', '#a78bfa', '#ec4899'];

  const canvas = document.getElementById('adminPhaseFlowCanvas');
  if (!canvas) return;

  canvas.innerHTML = adminConversationPhases.map((phase, index) => {
    const color = colors[index % colors.length];
    const isLast = index === adminConversationPhases.length - 1;

    return `
      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="background: ${color}; color: white; padding: 15px 20px; border-radius: 8px; font-weight: 600; font-size: 14px; min-width: 180px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          ${phase.number}. ${phase.name}
        </div>
        ${!isLast ? `
          <div style="color: #666; font-size: 24px; font-weight: bold;">→</div>
        ` : ''}
      </div>
    `;
  }).join('');
}

/**
 * Add new admin phase
 */
function addAdminPhase() {
  const phaseId = `phase-${adminPhaseIdCounter++}`;
  const phaseNumber = adminConversationPhases.length + 1;

  const phase = {
    id: phaseId,
    number: phaseNumber,
    name: `Phase ${phaseNumber}`,
    description: '',
    instructions: '',
    gateConditions: ''
  };

  adminConversationPhases.push(phase);
  renderAdminPhases();
}

/**
 * Edit admin phase
 */
function editAdminPhase(index) {
  const phase = adminConversationPhases[index];
  if (!phase) return;

  const name = prompt('Phase Name:', phase.name);
  if (!name) return;

  const description = prompt('Description (What happens in this phase?):', phase.description);
  if (description === null) return;

  const instructions = prompt('Phase Instructions (How should AI behave?):', phase.instructions);
  if (instructions === null) return;

  const gateConditions = index < adminConversationPhases.length - 1
    ? prompt('Gate Conditions (When to advance to next phase?):', phase.gateConditions)
    : '';

  adminConversationPhases[index].name = name;
  adminConversationPhases[index].description = description;
  adminConversationPhases[index].instructions = instructions;
  if (gateConditions !== null) {
    adminConversationPhases[index].gateConditions = gateConditions;
  }

  renderAdminPhases();
}

/**
 * Delete admin phase
 */
function deleteAdminPhase(index) {
  if (!confirm('Are you sure you want to delete this phase?')) return;

  adminConversationPhases.splice(index, 1);

  // Renumber phases
  adminConversationPhases.forEach((phase, idx) => {
    phase.number = idx + 1;
  });

  renderAdminPhases();
}

/**
 * Load phase template
 */
function loadAdminPhaseTemplate(templateKey) {
  const ADMIN_PHASE_TEMPLATES = {
    'customer-support': [
      { name: 'Greeting & Issue Identification', description: 'Welcome customer and understand their issue', instructions: 'Greet warmly. Ask what they need help with. Listen actively. Be empathetic if they\'re frustrated.', gateConditions: 'Issue clearly identified' },
      { name: 'Information Gathering', description: 'Collect relevant details about the issue', instructions: 'Ask clarifying questions. Get account details if needed. Document the problem thoroughly.', gateConditions: 'All necessary information collected' },
      { name: 'Solution & Resolution', description: 'Provide solution or escalate if needed', instructions: 'Offer solution steps clearly. If can\'t resolve, offer escalation. Confirm customer understands.', gateConditions: 'Solution provided or escalation initiated' },
      { name: 'Closing & Follow-up', description: 'Confirm resolution and set expectations', instructions: 'Ask if anything else needed. Provide ticket number if applicable. Thank them for calling.', gateConditions: '' }
    ],
    'appointment-booking': [
      { name: 'Greeting & Authentication', description: 'Welcome caller and verify identity', instructions: 'Greet professionally. Ask for name and reason for appointment. Verify identity if returning customer.', gateConditions: 'Identity verified AND reason provided' },
      { name: 'Date & Time Selection', description: 'Find suitable appointment slot', instructions: 'Offer available dates. Be flexible with options. Confirm their preferred time. Check availability.', gateConditions: 'Date AND time confirmed' },
      { name: 'Details & Confirmation', description: 'Collect additional details and confirm booking', instructions: 'Collect contact info. Note any special requests. Read back all details for confirmation.', gateConditions: 'All details confirmed' },
      { name: 'Closing', description: 'Provide confirmation and next steps', instructions: 'Give confirmation number. Explain how to reschedule. Send confirmation if possible. Thank them.', gateConditions: '' }
    ],
    'lead-qualification': [
      { name: 'Introduction & Interest', description: 'Introduce company and gauge interest', instructions: 'Brief intro of company value proposition. Ask if now is a good time. Gauge initial interest level.', gateConditions: 'Interest confirmed' },
      { name: 'Needs Assessment', description: 'Understand prospect\'s needs and pain points', instructions: 'Ask about current situation. Identify pain points. Understand their goals. Listen more than talk.', gateConditions: 'Needs clearly understood' },
      { name: 'Qualification', description: 'Determine fit and decision-making authority', instructions: 'Ask about budget range. Identify decision maker. Understand timeline. Assess fit with offering.', gateConditions: 'Qualified as viable lead' },
      { name: 'Next Steps', description: 'Schedule demo or meeting', instructions: 'Propose next step (demo, meeting). Get commitment. Set specific date/time. Confirm contact details.', gateConditions: '' }
    ]
  };

  const template = ADMIN_PHASE_TEMPLATES[templateKey];
  if (!template) {
    alert('Template not found');
    return;
  }

  // Clear existing phases
  adminConversationPhases = [];
  adminPhaseIdCounter = 1;

  // Load template phases
  template.forEach((phase, index) => {
    const phaseId = `phase-${adminPhaseIdCounter++}`;
    adminConversationPhases.push({
      id: phaseId,
      number: index + 1,
      name: phase.name,
      description: phase.description,
      instructions: phase.instructions,
      gateConditions: phase.gateConditions
    });
  });

  renderAdminPhases();

  const templateNames = {
    'customer-support': 'Customer Support',
    'appointment-booking': 'Appointment Booking',
    'lead-qualification': 'Lead Qualification'
  };

  alert(`✅ Loaded ${templateNames[templateKey]} template with ${template.length} phases!`);
}

/**
 * Clear all admin phases
 */
function clearAllAdminPhases() {
  if (adminConversationPhases.length === 0) {
    alert('No phases to clear');
    return;
  }

  if (!confirm(`Are you sure you want to clear all ${adminConversationPhases.length} phases?`)) {
    return;
  }

  adminConversationPhases = [];
  adminPhaseIdCounter = 1;
  renderAdminPhases();
}

/**
 * Save admin phases to database
 */
async function saveAdminPhases() {
  try {
    const response = await fetch(`${API_BASE}/api/student-config-update`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionToken: SESSION_TOKEN,
        conversationPhases: adminConversationPhases
      })
    });

    const data = await response.json();

    if (data.success) {
      alert('✅ Conversation phases saved successfully!');
      config.conversationPhases = adminConversationPhases;
    } else {
      alert('❌ Failed to save phases: ' + data.error);
    }
  } catch (error) {
    alert('❌ Error: ' + error.message);
  }
}

/**
 * Generate system prompt from phases
 */
function generateSystemPromptFromPhases() {
  if (adminConversationPhases.length === 0) {
    alert('⚠️ Please define at least one phase first');
    return;
  }

  let promptAddition = '\n\n# CONVERSATION PHASES & STATE MANAGEMENT\n\n';
  promptAddition += 'This conversation follows a structured phase-based approach. Each phase has specific goals and constraints.\n\n';

  adminConversationPhases.forEach((phase, index) => {
    promptAddition += `## Phase ${phase.number}: ${phase.name}\n`;
    if (phase.description) {
      promptAddition += `**Purpose:** ${phase.description}\n\n`;
    }
    if (phase.instructions) {
      promptAddition += `**Instructions:**\n${phase.instructions}\n\n`;
    }
    if (phase.gateConditions && index < adminConversationPhases.length - 1) {
      promptAddition += `**Advance to Phase ${phase.number + 1} when:** ${phase.gateConditions}\n\n`;
    }
    if (index === adminConversationPhases.length - 1) {
      promptAddition += '**This is the final phase.** Complete the conversation gracefully.\n\n';
    }
  });

  promptAddition += '---\n\n';
  promptAddition += '**IMPORTANT:** Track which phase you\'re in throughout the conversation. Follow the phase-specific instructions. Only discuss topics relevant to the current phase. When gate conditions are met, smoothly transition to the next phase.';

  const systemPromptField = document.getElementById('systemPromptEditor');
  if (!systemPromptField) {
    alert('❌ System prompt field not found. Go to Prompts tab first.');
    return;
  }

  const currentPrompt = systemPromptField.value;

  // Check if phases already exist in prompt
  if (currentPrompt.includes('# CONVERSATION PHASES & STATE MANAGEMENT')) {
    // Replace existing phases section
    const beforePhases = currentPrompt.substring(0, currentPrompt.indexOf('# CONVERSATION PHASES & STATE MANAGEMENT'));
    systemPromptField.value = beforePhases.trim() + promptAddition;
  } else {
    // Append to existing prompt
    systemPromptField.value = currentPrompt.trim() + promptAddition;
  }

  alert(`✅ Conversation phases added to system prompt!\n\nPhases defined: ${adminConversationPhases.length}\n\nDon't forget to save your system prompt!`);
}
