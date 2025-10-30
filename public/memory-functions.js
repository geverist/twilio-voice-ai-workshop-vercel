// =========================================================================
// PERSISTENT MEMORY MANAGEMENT (OpenAI Assistants)
// =========================================================================

let memoryThreads = [];

/**
 * Initialize memory settings
 */
function initializeMemorySettings() {
  // Set checkbox state
  const enabledCheckbox = document.getElementById('enableMemoryCheckbox');
  if (enabledCheckbox && config.enablePersistentMemory !== undefined) {
    enabledCheckbox.checked = config.enablePersistentMemory;
  }

  // Set retention days
  const retentionInput = document.getElementById('memoryRetentionDays');
  if (retentionInput && config.memoryRetentionDays) {
    retentionInput.value = config.memoryRetentionDays;
  }
}

/**
 * Toggle persistent memory on/off
 */
async function togglePersistentMemory() {
  const enabled = document.getElementById('enableMemoryCheckbox').checked;

  try {
    await saveConfigField('enablePersistentMemory', enabled);
    alert(`✅ Persistent memory ${enabled ? 'enabled' : 'disabled'}`);

    if (enabled) {
      // Load threads when enabled
      await loadMemoryThreads();
    }
  } catch (error) {
    alert(`❌ Failed to toggle memory: ${error.message}`);
  }
}

/**
 * Update memory retention days
 */
async function updateMemoryRetention() {
  const days = parseInt(document.getElementById('memoryRetentionDays').value);

  if (isNaN(days) || days < 1) {
    alert('❌ Please enter a valid number of days (minimum 1)');
    return;
  }

  try {
    await saveConfigField('memoryRetentionDays', days);
    alert(`✅ Memory retention set to ${days} days`);
  } catch (error) {
    alert(`❌ Failed to update retention: ${error.message}`);
  }
}

/**
 * Load all memory threads for this session
 */
async function loadMemoryThreads() {
  const btn = document.getElementById('loadThreadsBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Loading...';
  }

  document.getElementById('threadsLoading').style.display = 'block';
  document.getElementById('threadsContent').style.display = 'none';
  document.getElementById('threadsEmpty').style.display = 'none';

  try {
    const response = await fetch(`${API_BASE}/api/memory-threads?sessionToken=${SESSION_TOKEN}`);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to load memory threads');
    }

    memoryThreads = data.threads || [];

    document.getElementById('threadsLoading').style.display = 'none';

    if (memoryThreads.length === 0) {
      document.getElementById('threadsEmpty').style.display = 'block';
    } else {
      renderMemoryThreads();
      document.getElementById('threadsContent').style.display = 'block';
    }

  } catch (error) {
    console.error('Memory threads error:', error);
    document.getElementById('threadsLoading').style.display = 'none';
    alert('❌ Failed to load memory threads: ' + error.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🔄 Reload Threads';
    }
  }
}

/**
 * Render memory threads list
 */
function renderMemoryThreads() {
  const threadsList = document.getElementById('threadsList');

  threadsList.innerHTML = memoryThreads.map(thread => {
    const lastInteraction = new Date(thread.last_interaction);
    const created = new Date(thread.created_at);

    return `
      <div class="setting-card" style="margin-bottom: 15px; border-left: 4px solid #8b5cf6;">
        <div style="display: flex; justify-content: space-between; align-items: start;">
          <div style="flex: 1;">
            <h3 style="margin: 0 0 5px 0; color: #8b5cf6; font-size: 16px;">
              📞 ${thread.phone_number}
            </h3>
            <div style="font-size: 13px; color: #666; margin-top: 8px;">
              <div><strong>Thread ID:</strong> <span style="font-family: monospace; font-size: 12px;">${thread.thread_id}</span></div>
              <div style="margin-top: 5px;"><strong>Messages:</strong> ${thread.message_count || 0}</div>
              <div style="margin-top: 5px;"><strong>Last interaction:</strong> ${formatDateTime(lastInteraction)}</div>
              <div style="margin-top: 5px;"><strong>Created:</strong> ${formatDateTime(created)}</div>
            </div>
          </div>
          <div>
            <button onclick="deleteMemoryThread('${thread.phone_number}')"
                    style="padding: 8px 16px; font-size: 13px; cursor: pointer; background: #ef4444; color: white; border: none; border-radius: 6px;">
              🗑️ Delete Memory
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Update stats
  document.getElementById('totalThreadsCount').textContent = memoryThreads.length;
  const totalMessages = memoryThreads.reduce((sum, t) => sum + (t.message_count || 0), 0);
  document.getElementById('totalMessagesCount').textContent = totalMessages;
}

/**
 * Delete a memory thread for a phone number
 */
async function deleteMemoryThread(phoneNumber) {
  if (!confirm(`Delete all conversation memory for ${phoneNumber}?\n\nThis action cannot be undone.`)) {
    return;
  }

  try {
    const openaiKey = localStorage.getItem('openaiApiKey');

    const response = await fetch(`${API_BASE}/api/memory-threads`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionToken: SESSION_TOKEN,
        phoneNumber: phoneNumber,
        openaiApiKey: openaiKey
      })
    });

    const data = await response.json();

    if (data.success) {
      alert(`✅ Memory deleted for ${phoneNumber}`);
      await loadMemoryThreads(); // Reload list
    } else {
      alert('❌ Failed to delete memory: ' + data.error);
    }
  } catch (error) {
    alert('❌ Error: ' + error.message);
  }
}

/**
 * Clear all memory threads
 */
async function clearAllMemory() {
  if (!confirm('⚠️ Delete ALL conversation memory?\n\nThis will remove memory for all phone numbers and cannot be undone.')) {
    return;
  }

  if (!confirm('Are you absolutely sure? This action is permanent.')) {
    return;
  }

  try {
    const openaiKey = localStorage.getItem('openaiApiKey');

    // Delete each thread
    for (const thread of memoryThreads) {
      await fetch(`${API_BASE}/api/memory-threads`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionToken: SESSION_TOKEN,
          phoneNumber: thread.phone_number,
          openaiApiKey: openaiKey
        })
      });
    }

    alert('✅ All memory cleared successfully');
    await loadMemoryThreads();
  } catch (error) {
    alert('❌ Error clearing memory: ' + error.message);
  }
}

/**
 * Format date/time for display
 */
function formatDateTime(date) {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
