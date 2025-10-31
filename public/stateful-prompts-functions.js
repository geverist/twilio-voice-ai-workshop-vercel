// =========================================================================
// STATEFUL PROMPTS & USE CASE MANAGEMENT
// =========================================================================

// Global state for conversation states
let conversationStates = [];
let statefulModeEnabled = false;

/**
 * Initialize stateful prompts UI
 */
function initializeStatefulPrompts() {
  // Load conversation states from config
  if (config.conversationStates) {
    try {
      conversationStates = typeof config.conversationStates === 'string'
        ? JSON.parse(config.conversationStates)
        : config.conversationStates;
    } catch (e) {
      console.error('Failed to parse conversation states:', e);
      conversationStates = [];
    }
  }

  // Check if stateful mode is enabled
  statefulModeEnabled = conversationStates && conversationStates.length > 0;
  document.getElementById('statefulModeCheckbox').checked = statefulModeEnabled;

  // Show appropriate mode
  toggleStatefulMode();
}

/**
 * Toggle between simple and stateful prompt modes
 */
function toggleStatefulMode() {
  statefulModeEnabled = document.getElementById('statefulModeCheckbox').checked;

  const simpleMode = document.getElementById('simplePromptMode');
  const statefulMode = document.getElementById('statefulPromptMode');

  if (statefulModeEnabled) {
    // If enabling stateful mode for first time with no states, create initial state from existing prompt
    if (conversationStates.length === 0 && config.systemPrompt) {
      conversationStates = [{
        id: `state_${Date.now()}`,
        name: 'Initial State',
        isDefault: true,
        systemPrompt: config.systemPrompt,
        transitions: []
      }];
    }

    simpleMode.style.display = 'none';
    statefulMode.style.display = 'block';
    renderStates();
  } else {
    simpleMode.style.display = 'block';
    statefulMode.style.display = 'none';
  }
}

/**
 * Render all conversation states
 */
function renderStates() {
  const statesList = document.getElementById('statesList');
  const statesEmpty = document.getElementById('statesEmpty');

  if (!conversationStates || conversationStates.length === 0) {
    statesList.style.display = 'none';
    statesEmpty.style.display = 'block';
    renderFlowDiagram();
    return;
  }

  statesEmpty.style.display = 'none';
  statesList.style.display = 'block';

  statesList.innerHTML = conversationStates.map((state, index) => `
    <div class="setting-card" style="margin-bottom: 20px; border-left: 4px solid ${state.isDefault ? '#10b981' : '#667eea'};">
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px;">
        <div style="flex: 1;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
            <h3 style="margin: 0; color: #333;">${state.name}</h3>
            ${state.isDefault ? '<span style="background: #10b981; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">DEFAULT</span>' : ''}
          </div>
          <p style="color: #666; font-size: 13px; margin: 0;">${state.id}</p>
        </div>
        <div style="display: flex; gap: 10px;">
          <button onclick="editState(${index})" style="padding: 6px 12px; font-size: 12px; cursor: pointer; background: #667eea; color: white; border: none; border-radius: 4px;">
            ✏️ Edit
          </button>
          ${!state.isDefault ? `
            <button onclick="deleteState(${index})" style="padding: 6px 12px; font-size: 12px; cursor: pointer; background: #ef4444; color: white; border: none; border-radius: 4px;">
              🗑️ Delete
            </button>
          ` : ''}
        </div>
      </div>

      <!-- System Prompt Preview -->
      <div style="margin-bottom: 15px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <strong style="color: #333; font-size: 13px;">System Prompt:</strong>
          <button onclick="generateStatePrompt(${index})" style="padding: 4px 10px; font-size: 11px; cursor: pointer; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: none; border-radius: 4px; font-weight: 600;">
            ✨ Generate with Best Practices
          </button>
        </div>
        <div style="background: #f8f9fa; padding: 10px; border-radius: 6px; margin-top: 5px; font-size: 13px; max-height: 100px; overflow-y: auto;">
          ${state.systemPrompt || 'No prompt defined'}
        </div>
      </div>

      <!-- Transitions -->
      ${state.transitions && state.transitions.length > 0 ? `
        <div>
          <strong style="color: #333; font-size: 13px;">Transitions (${state.transitions.length}):</strong>
          <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 8px;">
            ${state.transitions.map(t => `
              <div style="background: #e0f2fe; padding: 8px 12px; border-radius: 6px; border-left: 3px solid #0369a1; font-size: 12px;">
                <div style="color: #0c4a6e; font-weight: 600;">→ ${getStateName(t.nextState)}</div>
                <div style="color: #075985; margin-top: 3px;">
                  When: <span style="font-family: monospace;">${t.condition.type}</span>
                  ${t.condition.value ? ` = "${t.condition.value}"` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : '<div style="color: #999; font-size: 13px;">No transitions defined</div>'}
    </div>
  `).join('');

  renderFlowDiagram();
}

/**
 * Render visual flow diagram with clickable states, arrows, and transition rules
 */
function renderFlowDiagram() {
  const flowDiagram = document.getElementById('flowDiagram');

  if (!conversationStates || conversationStates.length === 0) {
    flowDiagram.innerHTML = '<div style="color: #999; font-size: 14px;">No states to visualize</div>';
    return;
  }

  flowDiagram.innerHTML = conversationStates.map((state, index) => {
    const hasTransitions = state.transitions && state.transitions.length > 0;

    let transitionsHTML = '';
    if (hasTransitions) {
      // Show all transitions from this state
      transitionsHTML = state.transitions.map(transition => {
        const targetStateName = getStateName(transition.nextState);
        const conditionText = transition.condition.value
          ? `${transition.condition.type} = "${transition.condition.value}"`
          : transition.condition.type;

        return `
          <div style="display: flex; align-items: center; gap: 10px; margin-left: 20px;">
            <div style="display: flex; flex-direction: column; align-items: center; gap: 5px;">
              <div style="color: #f59e0b; font-size: 24px; font-weight: bold;">↓</div>
              <div style="background: #fef3c7; color: #92400e; padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; white-space: nowrap; max-width: 150px; overflow: hidden; text-overflow: ellipsis;" title="${conditionText}">
                ${conditionText}
              </div>
              <div style="color: #f59e0b; font-size: 24px; font-weight: bold;">↓</div>
            </div>
            <button
              onclick="scrollToStateByName('${targetStateName}')"
              style="background: #667eea; color: white; padding: 6px 12px; border-radius: 16px; font-size: 11px; font-weight: 600; border: none; cursor: pointer; transition: transform 0.2s;"
              onmouseover="this.style.transform='scale(1.05)';"
              onmouseout="this.style.transform='scale(1)';"
            >
              ${targetStateName}
            </button>
          </div>
        `;
      }).join('');
    }

    return `
      <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <button
            onclick="scrollToState(${index})"
            style="background: ${state.isDefault ? '#10b981' : '#667eea'}; color: white; padding: 10px 20px; border-radius: 24px; font-size: 14px; font-weight: 600; border: none; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;"
            onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.2)';"
            onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none';"
          >
            ${state.isDefault ? '🏁 ' : ''}${state.name}
          </button>
        </div>
        ${transitionsHTML}
      </div>
    `;
  }).join('');
}

/**
 * Scroll to a specific state card by index
 */
function scrollToState(stateIndex) {
  const statesList = document.getElementById('statesList');
  const stateCards = statesList.querySelectorAll('.setting-card');

  if (stateCards[stateIndex]) {
    stateCards[stateIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Flash highlight effect
    const originalBorder = stateCards[stateIndex].style.borderLeft;
    stateCards[stateIndex].style.borderLeft = '6px solid #f59e0b';
    setTimeout(() => {
      stateCards[stateIndex].style.borderLeft = originalBorder;
    }, 1500);
  }
}

/**
 * Scroll to a specific state card by name
 */
function scrollToStateByName(stateName) {
  const stateIndex = conversationStates.findIndex(s => s.name === stateName);
  if (stateIndex !== -1) {
    scrollToState(stateIndex);
  }
}

/**
 * Get state name by ID
 */
function getStateName(stateId) {
  const state = conversationStates.find(s => s.id === stateId);
  return state ? state.name : stateId;
}

/**
 * Add new conversation state
 */
function addNewState() {
  const newState = {
    id: `state_${Date.now()}`,
    name: `State ${conversationStates.length + 1}`,
    isDefault: conversationStates.length === 0,
    systemPrompt: '',
    transitions: []
  };

  conversationStates.push(newState);
  renderStates();

  // Scroll to bottom
  document.getElementById('statesList').lastElementChild?.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Edit a conversation state
 */
function editState(index) {
  const state = conversationStates[index];
  if (!state) return;

  const name = prompt('State Name:', state.name);
  if (!name) return;

  const systemPrompt = prompt('System Prompt (brief description - you can edit details after saving):', state.systemPrompt);
  if (systemPrompt === null) return;

  conversationStates[index].name = name;
  conversationStates[index].systemPrompt = systemPrompt;

  renderStates();
}

/**
 * Delete a conversation state
 */
function deleteState(index) {
  if (!confirm('Are you sure you want to delete this state?')) return;

  const stateId = conversationStates[index].id;

  // Remove any transitions pointing to this state
  conversationStates.forEach(state => {
    if (state.transitions) {
      state.transitions = state.transitions.filter(t => t.nextState !== stateId);
    }
  });

  conversationStates.splice(index, 1);
  renderStates();
}

/**
 * Save all states to database
 */
async function saveAllStates() {
  try {
    const response = await fetch(`${API_BASE}/api/student-config-update`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionToken: SESSION_TOKEN,
        conversationStates: conversationStates
      })
    });

    const data = await response.json();

    if (data.success) {
      alert('✅ Conversation states saved successfully!');
      config.conversationStates = conversationStates;
    } else {
      alert('❌ Failed to save states: ' + data.error);
    }
  } catch (error) {
    alert('❌ Error: ' + error.message);
  }
}

/**
 * Update use case description
 */
async function updateUseCase() {
  const newUseCase = document.getElementById('useCaseEditor').value.trim();

  if (!newUseCase) {
    alert('❌ Use case description cannot be empty');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/student-config-update`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionToken: SESSION_TOKEN,
        useCaseDescription: newUseCase
      })
    });

    const data = await response.json();

    if (data.success) {
      alert('✅ Use case updated successfully!');
      config.useCaseDescription = newUseCase;
      document.getElementById('useCaseDisplay').textContent = newUseCase;
    } else {
      alert('❌ Failed to update: ' + data.error);
    }
  } catch (error) {
    alert('❌ Error: ' + error.message);
  }
}

/**
 * Regenerate prompts based on use case
 */
async function regeneratePrompts() {
  const useCase = document.getElementById('useCaseEditor').value.trim();

  if (!useCase) {
    alert('❌ Please enter a use case description first');
    return;
  }

  if (!confirm('This will regenerate your system prompt and greeting based on your use case. Continue?')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/generate-use-case-content`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        useCaseDescription: useCase,
        callDirection: config.callDirection || 'inbound',
        openaiApiKey: localStorage.getItem('openaiApiKey'),
        skipInitialGreeting: config.skipInitialGreeting || false
      })
    });

    const data = await response.json();

    if (data.success) {
      // Update the prompts
      document.getElementById('systemPromptEditor').value = data.systemPrompt;
      document.getElementById('ivrGreetingEditor').value = data.ivrGreeting;

      // Save to database
      await saveConfigField('systemPrompt', data.systemPrompt);
      await saveConfigField('ivrGreeting', data.ivrGreeting);

      alert('✅ Prompts regenerated successfully!');
    } else {
      alert('❌ Failed to regenerate: ' + data.error);
    }
  } catch (error) {
    alert('❌ Error: ' + error.message);
  }
}

/**
 * Generate prompt for a specific state using best practices
 */
async function generateStatePrompt(stateIndex) {
  const state = conversationStates[stateIndex];
  if (!state) return;

  const useCase = document.getElementById('useCaseEditor').value.trim();

  if (!useCase) {
    alert('❌ Please enter a use case description first in the Overview tab');
    return;
  }

  // Ask user for context about this specific state
  const stateContext = prompt(
    `Generate prompt for state: ${state.name}\n\n` +
    `What should the AI do in this state?\n` +
    `(e.g., "Collect customer name and contact info", "Handle appointment booking", "Process payment")`,
    state.systemPrompt || ''
  );

  if (!stateContext) return;

  try {
    const response = await fetch(`${API_BASE}/api/generate-use-case-content`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        useCaseDescription: useCase + '\n\nFor this specific state: ' + stateContext,
        callDirection: config.callDirection || 'inbound',
        openaiApiKey: localStorage.getItem('openaiApiKey'),
        skipInitialGreeting: true // States don't need greetings
      })
    });

    const data = await response.json();

    if (data.success) {
      // Update the state's prompt
      conversationStates[stateIndex].systemPrompt = data.systemPrompt;

      // Re-render to show updated prompt
      renderStates();

      // Auto-save the states
      await saveAllStates();

      alert(`✅ Prompt generated for ${state.name}!`);
    } else {
      alert('❌ Failed to generate prompt: ' + data.error);
    }
  } catch (error) {
    alert('❌ Error: ' + error.message);
  }
}
