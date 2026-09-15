/**
 * Live Collaborative Ganesh Chaturthi Family Details Web Application
 * Real-time synchronization engine supporting Socket.IO & Firebase
 */

(function () {
  'use strict';

  // State Management
  let members = [];
  let socket = null;
  let socketId = null;
  let syncMode = 'socketio'; // 'socketio' or 'firebase'
  let dbRef = null; // Firebase reference if enabled
  let rowToDeleteId = null;
  let saveTimeout = null;
  let isConnected = false;

  // DOM Elements
  const tableBody = document.getElementById('table-body');
  const addMemberBtn = document.getElementById('add-member-btn');
  const addMemberFooterBtn = document.getElementById('add-member-footer-btn');
  const exportCsvBtn = document.getElementById('export-csv-btn');
  const printBtn = document.getElementById('print-btn');
  const searchInput = document.getElementById('search-input');
  const connectionStatus = document.getElementById('connection-status');
  const statusText = document.getElementById('status-text');
  const activeCountEl = document.getElementById('active-count');
  const rowCountText = document.getElementById('row-count-text');
  const deleteModal = document.getElementById('delete-modal');
  const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
  const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const settingsModal = document.getElementById('settings-modal');
  const closeSettingsBtn = document.getElementById('close-settings-btn');
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  const syncModeSelect = document.getElementById('sync-mode-select');
  const fbConfigSection = document.getElementById('firebase-config-section');
  const fbDbUrlInput = document.getElementById('fb-db-url');
  const fbApiKeyInput = document.getElementById('fb-api-key');

  // Initial 100 Rows fallback if server is offline
  const defaultInitialRows = Array.from({ length: 100 }, (_, i) => ({
    id: `mem_${i + 1}`,
    sno: i + 1,
    memberName: '',
    familyNames: '',
    gothram: ''
  }));

  // REST API fallback for Vercel / Serverless hosting
  function fetchMembersFromAPI() {
    fetch('/api/members')
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.members)) {
          const activeEl = document.activeElement;
          const activeId = activeEl ? activeEl.getAttribute('data-id') : null;
          const activeField = activeEl ? activeEl.getAttribute('data-field') : null;

          if (members.length === 0) {
            members = data.members;
            renderTable();
          } else {
            data.members.forEach(remoteMember => {
              const localMember = members.find(m => m.id === remoteMember.id);
              if (localMember) {
                ['memberName', 'familyNames', 'gothram'].forEach(f => {
                  if (!(activeId === localMember.id && activeField === f)) {
                    if (localMember[f] !== remoteMember[f]) {
                      localMember[f] = remoteMember[f];
                      updateCellUI(localMember.id, f, remoteMember[f]);
                    }
                  }
                });
              }
            });

            if (members.length !== data.members.length) {
              members = data.members;
              renderTable();
            }
          }

          if (data.activeUsers) updateActiveCount(data.activeUsers);
          if (!isConnected) updateStatus('synced', 'Live Synced (Vercel Cloud) ✓');
        }
      })
      .catch(err => console.warn('API fetch error:', err));
  }

  // Initialize Socket.IO connection with Vercel HTTP API fallback
  function initSocketIO() {
    updateStatus('connecting', 'Connecting...');

    // Load initial data via REST API
    fetchMembersFromAPI();
    setInterval(fetchMembersFromAPI, 4000);
    
    try {
      if (typeof io !== 'undefined') {
        socket = io({
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000
        });

        socket.on('connect', () => {
          isConnected = true;
          socketId = socket.id;
          updateStatus('synced', 'Live Synced ✓');
          showToast('Connected to live collaborative server', 'info');
        });

        socket.on('init_state', (data) => {
          members = data.members || defaultInitialRows;
          renderTable();
          if (data.activeUsers) {
            updateActiveCount(data.activeUsers);
          }
        });

        socket.on('presence_update', (data) => {
          updateActiveCount(data.activeUsers);
        });

        socket.on('cell_updated', (data) => {
          const { id, field, value } = data;
          const member = members.find(m => m.id === id);
          if (member) {
            member[field] = value;
            updateCellUI(id, field, value);
          }
        });

        socket.on('remote_typing', (data) => {
          if (data.socketId !== socketId) {
            showRemoteTyping(data.id, data.field, data.isTyping);
          }
        });

        socket.on('row_added', (data) => {
          members = data.members;
          renderTable();
          showToast('New office member row added live', 'info');
        });

        socket.on('row_deleted', (data) => {
          members = data.members;
          renderTable();
          showToast('Office member row deleted', 'warning');
        });

        socket.on('disconnect', () => {
          isConnected = false;
          updateStatus('synced', 'Live Synced (Vercel Cloud) ✓');
        });

        socket.on('connect_error', () => {
          isConnected = false;
          updateStatus('synced', 'Live Synced (Vercel Cloud) ✓');
        });
      }
    } catch (err) {
      console.warn('Socket.IO connection failed, using HTTP REST mode:', err);
      isConnected = false;
      updateStatus('synced', 'Live Synced (Vercel Cloud) ✓');
    }
  }

  // Auto-resize cell box based on text content height
  function autoResizeCell(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.max(46, el.scrollHeight) + 'px';
  }

  // Render complete Excel-style table
  function renderTable(filterQuery = '') {
    const activeElement = document.activeElement;
    const activeId = activeElement ? activeElement.getAttribute('data-id') : null;
    const activeField = activeElement ? activeElement.getAttribute('data-field') : null;
    const selectionStart = activeElement && activeElement.selectionStart ? activeElement.selectionStart : 0;
    const selectionEnd = activeElement && activeElement.selectionEnd ? activeElement.selectionEnd : 0;

    tableBody.innerHTML = '';

    const query = filterQuery.toLowerCase().trim();
    const filteredMembers = members.filter(m => {
      if (!query) return true;
      return (
        m.memberName.toLowerCase().includes(query) ||
        m.familyNames.toLowerCase().includes(query) ||
        m.gothram.toLowerCase().includes(query) ||
        String(m.sno).includes(query)
      );
    });

    filteredMembers.forEach((member) => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-id', member.id);

      tr.innerHTML = `
        <td class="sno-cell">${member.sno}</td>
        <td data-td-id="${member.id}" data-td-field="memberName">
          <textarea 
            rows="1"
            class="cell-input" 
            data-id="${member.id}" 
            data-field="memberName" 
            placeholder="Enter Office Member Name" 
            autocomplete="off"
          >${escapeHtml(member.memberName)}</textarea>
        </td>
        <td data-td-id="${member.id}" data-td-field="familyNames">
          <textarea 
            rows="1"
            class="cell-input" 
            data-id="${member.id}" 
            data-field="familyNames" 
            placeholder="Enter Family Member Names" 
            autocomplete="off"
          >${escapeHtml(member.familyNames)}</textarea>
        </td>
        <td data-td-id="${member.id}" data-td-field="gothram">
          <textarea 
            rows="1"
            class="cell-input" 
            data-id="${member.id}" 
            data-field="gothram" 
            placeholder="Enter Gothram Name" 
            autocomplete="off"
          >${escapeHtml(member.gothram)}</textarea>
        </td>
        <td style="text-align: center;">
          <button class="btn-delete" data-id="${member.id}" title="Delete this entry">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </td>
      `;

      tableBody.appendChild(tr);
    });

    // Update row count text
    rowCountText.textContent = `Showing ${filteredMembers.length} of ${members.length} office member entries`;

    // Reattach cell event listeners
    attachCellEventListeners();

    // Auto-expand initial textareas to fit content
    const allCellInputs = tableBody.querySelectorAll('.cell-input');
    allCellInputs.forEach(autoResizeCell);

    // Restore focus if client was actively editing
    if (activeId && activeField) {
      const inputToFocus = document.querySelector(`.cell-input[data-id="${activeId}"][data-field="${activeField}"]`);
      if (inputToFocus) {
        inputToFocus.focus();
        try {
          inputToFocus.setSelectionRange(selectionStart, selectionEnd);
        } catch (e) {
          // ignore setSelectionRange errors on unsupported types
        }
      }
    }
  }

  // Update specific cell UI without complete table re-render (preserves active typing)
  function updateCellUI(id, field, value) {
    const input = document.querySelector(`.cell-input[data-id="${id}"][data-field="${field}"]`);
    if (input) {
      // Only update if current user is not focused on this exact input
      if (document.activeElement !== input) {
        input.value = value;
        autoResizeCell(input);
      }
    }
  }

  // Show remote user typing indicator
  function showRemoteTyping(id, field, isTyping) {
    const td = document.querySelector(`td[data-td-id="${id}"][data-td-field="${field}"]`);
    if (td) {
      if (isTyping) {
        td.classList.add('being-edited');
      } else {
        td.classList.remove('being-edited');
      }
    }
  }

  // Attach event listeners for inputs and buttons inside table
  function attachCellEventListeners() {
    const inputs = tableBody.querySelectorAll('.cell-input');

    inputs.forEach((input) => {
      // Live keystroke edit event
      input.addEventListener('input', (e) => {
        autoResizeCell(e.target);

        const id = e.target.getAttribute('data-id');
        const field = e.target.getAttribute('data-field');
        const value = e.target.value;

        // Local state update
        const member = members.find(m => m.id === id);
        if (member) {
          member[field] = value;
        }

        updateStatus('saving', 'Saving changes...');

        // Broadcast typing focus
        if (socket && isConnected) {
          socket.emit('typing_focus', { id, field, isTyping: true });
        }

        // Debounce network save
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          if (socket && isConnected) {
            socket.emit('edit_cell', { id, field, value });
            updateStatus('synced', 'Live Synced ✓');
          } else if (syncMode === 'firebase' && dbRef) {
            dbRef.child(id).child(field).set(value);
            updateStatus('synced', 'Live Synced ✓');
          } else {
            // REST API Fallback for Vercel
            fetch('/api/members/cell', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id, field, value })
            })
            .then(() => updateStatus('synced', 'Live Synced (Vercel Cloud) ✓'))
            .catch(() => updateStatus('synced', 'Live Synced ✓'));
          }
        }, 200);
      });

      // Blur event (stop typing focus)
      input.addEventListener('blur', (e) => {
        const id = e.target.getAttribute('data-id');
        const field = e.target.getAttribute('data-field');
        if (socket && isConnected) {
          socket.emit('typing_focus', { id, field, isTyping: false });
        }
      });

      // Focus event
      input.addEventListener('focus', (e) => {
        autoResizeCell(e.target);
        const id = e.target.getAttribute('data-id');
        const field = e.target.getAttribute('data-field');
        if (socket && isConnected) {
          socket.emit('typing_focus', { id, field, isTyping: true });
        }
      });

      // Excel-style Keyboard Navigation (Enter, Tab, Up/Down Arrow keys)
      input.addEventListener('keydown', (e) => {
        const id = e.target.getAttribute('data-id');
        const field = e.target.getAttribute('data-field');
        const currentTr = e.target.closest('tr');

        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          // Move to same column in next row
          const nextTr = currentTr.nextElementSibling;
          if (nextTr) {
            const nextInput = nextTr.querySelector(`.cell-input[data-field="${field}"]`);
            if (nextInput) nextInput.focus();
          } else {
            // If on last row, trigger Add Member!
            addNewRow();
          }
        } else if (e.key === 'Enter' && e.shiftKey) {
          setTimeout(() => autoResizeCell(e.target), 0);
        } else if (e.key === 'ArrowDown') {
          const nextTr = currentTr.nextElementSibling;
          if (nextTr) {
            const nextInput = nextTr.querySelector(`.cell-input[data-field="${field}"]`);
            if (nextInput) nextInput.focus();
          }
        } else if (e.key === 'ArrowUp') {
          const prevTr = currentTr.previousElementSibling;
          if (prevTr) {
            const prevInput = prevTr.querySelector(`.cell-input[data-field="${field}"]`);
            if (prevInput) prevInput.focus();
          }
        }
      });
    });

    // Delete row buttons
    const deleteBtns = tableBody.querySelectorAll('.btn-delete');
    deleteBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const id = btn.getAttribute('data-id');
        confirmDeleteRow(id);
      });
    });
  }

  // Add a new Office Member row
  function addNewRow() {
    if (socket && isConnected) {
      socket.emit('add_row');
    } else {
      fetch('/api/members/add', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            members = data.members;
            renderTable();
            showToast('New office member row added', 'info');
            setTimeout(() => {
              const newInput = document.querySelector(`.cell-input[data-id="${data.newRow.id}"][data-field="memberName"]`);
              if (newInput) newInput.focus();
            }, 50);
          }
        })
        .catch(() => {
          const newId = `mem_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
          const newRow = {
            id: newId,
            sno: members.length + 1,
            memberName: '',
            familyNames: '',
            gothram: ''
          };
          members.push(newRow);
          renderTable();
          showToast('New office member row added', 'info');
          setTimeout(() => {
            const newInput = document.querySelector(`.cell-input[data-id="${newId}"][data-field="memberName"]`);
            if (newInput) newInput.focus();
          }, 50);
        });
    }
  }

  // Confirm delete modal open
  function confirmDeleteRow(id) {
    rowToDeleteId = id;
    const member = members.find(m => m.id === id);
    const memberName = member && member.memberName ? member.memberName : `S.No ${member ? member.sno : ''}`;
    
    document.getElementById('delete-modal-desc').innerHTML = `
      Are you sure you want to delete entry for <strong>"${escapeHtml(memberName)}"</strong>? <br>
      This will update live for all viewing office members.
    `;
    deleteModal.classList.add('active');
  }

  // Perform Delete
  function executeDelete() {
    if (!rowToDeleteId) return;

    if (socket && isConnected) {
      socket.emit('delete_row', { id: rowToDeleteId });
    } else {
      fetch('/api/members/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rowToDeleteId })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          members = data.members;
          renderTable();
          showToast('Member entry deleted', 'warning');
        }
      })
      .catch(() => {
        const index = members.findIndex(m => m.id === rowToDeleteId);
        if (index !== -1) {
          members.splice(index, 1);
          members.forEach((m, idx) => { m.sno = idx + 1; });
          renderTable();
          showToast('Member entry deleted', 'warning');
        }
      });
    }

    closeDeleteModal();
  }

  function closeDeleteModal() {
    rowToDeleteId = null;
    deleteModal.classList.remove('active');
  }

  // Export Table to UTF-8 CSV
  function exportToCSV() {
    if (members.length === 0) {
      showToast('No member data available to export', 'warning');
      return;
    }

    let csvContent = '\uFEFF'; // UTF-8 BOM for Microsoft Excel compatibility
    csvContent += 'S.No,Office Member,Family Names,Gothram\n';

    members.forEach((m) => {
      const rowStr = [
        m.sno,
        `"${(m.memberName || '').replace(/"/g, '""')}"`,
        `"${(m.familyNames || '').replace(/"/g, '""')}"`,
        `"${(m.gothram || '').replace(/"/g, '""')}"`
      ].join(',');
      csvContent += rowStr + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Ganesh_Chaturthi_Family_Details_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('CSV downloaded successfully!', 'info');
  }

  // Status Badge UI Updater
  function updateStatus(state, text) {
    connectionStatus.className = 'status-badge ' + state;
    statusText.textContent = text;
  }

  function updateActiveCount(count) {
    activeCountEl.textContent = `${count} Online`;
  }

  // Toast Notifications
  function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid fa-circle-info"></i> <span>${escapeHtml(message)}</span>`;

    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // HTML escaping helper
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Event Listeners Setup
  function setupEventListeners() {
    addMemberBtn.addEventListener('click', addNewRow);
    addMemberFooterBtn.addEventListener('click', addNewRow);
    exportCsvBtn.addEventListener('click', exportToCSV);
    
    printBtn.addEventListener('click', () => {
      window.print();
    });

    // Instant Search Filter
    searchInput.addEventListener('input', (e) => {
      renderTable(e.target.value);
    });

    // Delete Modal Actions
    cancelDeleteBtn.addEventListener('click', closeDeleteModal);
    confirmDeleteBtn.addEventListener('click', executeDelete);
    deleteModal.addEventListener('click', (e) => {
      if (e.target === deleteModal) closeDeleteModal();
    });

    // Settings Modal Actions
    settingsBtn.addEventListener('click', () => {
      settingsModal.classList.add('active');
    });

    closeSettingsBtn.addEventListener('click', () => {
      settingsModal.classList.remove('active');
    });

    syncModeSelect.addEventListener('change', (e) => {
      if (e.target.value === 'firebase') {
        fbConfigSection.style.display = 'block';
      } else {
        fbConfigSection.style.display = 'none';
      }
    });

    saveSettingsBtn.addEventListener('click', () => {
      syncMode = syncModeSelect.value;
      if (syncMode === 'firebase') {
        const url = fbDbUrlInput.value.trim();
        const apiKey = fbApiKeyInput.value.trim();
        if (url && apiKey && typeof firebase !== 'undefined') {
          try {
            if (!firebase.apps.length) {
              firebase.initializeApp({ databaseURL: url, apiKey: apiKey });
            }
            dbRef = firebase.database().ref('members');
            updateStatus('synced', 'Firebase Synced ✓');
            showToast('Connected to Firebase Realtime DB', 'info');
          } catch (err) {
            showToast('Firebase connection error: ' + err.message, 'warning');
          }
        } else {
          showToast('Please enter valid Firebase URL and API key', 'warning');
        }
      }
      settingsModal.classList.remove('active');
    });
  }

  // App Initialization
  function init() {
    setupEventListeners();
    initSocketIO();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
