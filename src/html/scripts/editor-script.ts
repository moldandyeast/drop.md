/**
 * Editor page JavaScript
 * 
 * This is the heart of the collaborative editing experience.
 * Uses Yjs for CRDT-based real-time sync over WebSocket.
 */
export function editorScript(docId: string): string {
  return `
    // Import Yjs from CDN (ESM)
    import * as Y from 'https://cdn.jsdelivr.net/npm/yjs@13.6.10/+esm';

    const docId = '${docId}';
    const editor = document.getElementById('editor');
    const timer = document.getElementById('timer');
    const copyBtn = document.getElementById('copy-url');
    const presence = document.getElementById('presence');
    const connectionStatus = document.getElementById('connection-status');
    const statusDot = connectionStatus.querySelector('.status-dot');
    const statusText = connectionStatus.querySelector('.status-text');
    const liveIndicator = document.querySelector('.live-indicator');
    const liveText = document.querySelector('.live-text');

    // Message types matching the server
    const MessageType = {
      SYNC_STEP1: 0,   // Request state vector
      SYNC_STEP2: 1,   // Send state update
      UPDATE: 2,       // Incremental update
    };

    // lib0 encoding helpers (minimal implementation)
    const encoding = {
      createEncoder: () => ({ arr: [] }),
      writeVarUint: (encoder, num) => {
        while (num > 127) {
          encoder.arr.push((num & 127) | 128);
          num = Math.floor(num / 128);
        }
        encoder.arr.push(num & 127);
      },
      writeVarUint8Array: (encoder, arr) => {
        encoding.writeVarUint(encoder, arr.length);
        for (let i = 0; i < arr.length; i++) {
          encoder.arr.push(arr[i]);
        }
      },
      toUint8Array: (encoder) => new Uint8Array(encoder.arr),
    };

    const decoding = {
      createDecoder: (arr) => ({ arr, pos: 0 }),
      readVarUint: (decoder) => {
        let num = 0;
        let mult = 1;
        while (true) {
          const byte = decoder.arr[decoder.pos++];
          num += (byte & 127) * mult;
          if (byte < 128) break;
          mult *= 128;
        }
        return num;
      },
      readVarUint8Array: (decoder) => {
        const len = decoding.readVarUint(decoder);
        const arr = decoder.arr.slice(decoder.pos, decoder.pos + len);
        decoder.pos += len;
        return new Uint8Array(arr);
      },
    };

    // State
    let doc = new Y.Doc();
    let text = doc.getText('content');
    let ws = null;
    let isRemoteUpdate = false;
    let isSynced = false;
    let reconnectAttempts = 0;
    let reconnectTimeout = null;
    let expiresAt = parseInt(timer.dataset.expires, 10);

    // ===== TIMER =====
    function updateTimer() {
      const now = Date.now();
      const remaining = expiresAt - now;

      if (remaining <= 0) {
        timer.textContent = 'expired';
        timer.classList.add('danger');
        return;
      }

      const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
      const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

      if (days > 0) {
        timer.textContent = days + 'd ' + hours + 'h';
      } else if (hours > 0) {
        timer.textContent = hours + 'h ' + minutes + 'm';
      } else {
        timer.textContent = minutes + 'm';
      }

      // Warning states
      timer.classList.remove('warning', 'danger');
      if (remaining < 60 * 60 * 1000) { // < 1 hour
        timer.classList.add('danger');
      } else if (remaining < 24 * 60 * 60 * 1000) { // < 1 day
        timer.classList.add('warning');
      }
    }

    updateTimer();
    setInterval(updateTimer, 60000); // Update every minute

    // ===== COPY URL =====
    copyBtn.addEventListener('click', async () => {
      const url = window.location.href;
      const copyIcon = copyBtn.querySelector('.copy-icon');
      const copySuccess = copyBtn.querySelector('.copy-success');

      try {
        await navigator.clipboard.writeText(url);
        copyIcon.style.display = 'none';
        copySuccess.style.display = 'flex';

        setTimeout(() => {
          copyIcon.style.display = 'flex';
          copySuccess.style.display = 'none';
        }, 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    });

    // ===== CONNECTION STATUS =====
    function setConnectionStatus(status) {
      statusDot.className = 'status-dot ' + status;
      statusText.textContent = status;
      
      // Update live indicator
      if (status === 'connected') {
        liveIndicator.classList.remove('disconnected');
        liveText.textContent = 'live';
      } else if (status === 'disconnected') {
        liveIndicator.classList.add('disconnected');
        liveText.textContent = 'offline';
      }
      
      if (status === 'connecting' || status === 'disconnected') {
        connectionStatus.classList.add('visible');
      } else {
        // Hide after connected for a moment
        setTimeout(() => {
          if (statusDot.classList.contains('connected')) {
            connectionStatus.classList.remove('visible');
          }
        }, 2000);
      }
    }

    // ===== PRESENCE =====
    function updatePresence(count) {
      const dotsContainer = presence.querySelector('.presence-dots');
      const textEl = presence.querySelector('.presence-text');

      // Update dots
      dotsContainer.innerHTML = '';
      for (let i = 0; i < Math.min(count, 5); i++) {
        const dot = document.createElement('span');
        dot.className = 'presence-dot';
        dotsContainer.appendChild(dot);
      }

      // Update text
      textEl.textContent = count === 1 ? '1' : count.toString();
    }

    // ===== EDITOR SYNC =====
    const editorScroll = document.getElementById('editor-scroll');
    const spacerTop = document.querySelector('.editor-spacer-top');

    // Auto-resize textarea to fit content
    function autoResize() {
      editor.style.height = 'auto';
      editor.style.height = editor.scrollHeight + 'px';
    }

    // Smoothly adjust top spacer as content grows
    function updateEditorState() {
      autoResize();
      
      const viewportHeight = editorScroll.clientHeight;
      const contentHeight = editor.scrollHeight;
      
      // Calculate spacer: starts at ~45% of viewport, shrinks as content grows
      // When content is 0, spacer is 45vh (centered)
      // When content fills viewport, spacer is 2rem (top)
      const maxSpacer = viewportHeight * 0.45;
      const minSpacer = 32; // 2rem
      
      // Ratio: how much of available space is content using
      const ratio = Math.min(contentHeight / (viewportHeight * 0.5), 1);
      
      // Lerp from max to min
      const spacerHeight = maxSpacer - (ratio * (maxSpacer - minSpacer));
      
      spacerTop.style.minHeight = Math.max(spacerHeight, minSpacer) + 'px';
    }

    // When local text changes, apply to Yjs doc
    let inputDebounce = null;
    editor.addEventListener('input', () => {
      updateEditorState();
      if (isRemoteUpdate) return;

      // Debounce to batch rapid changes
      if (inputDebounce) clearTimeout(inputDebounce);
      inputDebounce = setTimeout(() => {
        const newValue = editor.value;
        doc.transact(() => {
          text.delete(0, text.length);
          text.insert(0, newValue);
        }, 'local');
      }, 0);
    });

    // When Yjs doc changes, update editor
    text.observe(event => {
      if (event.transaction.origin === 'local') return;

      isRemoteUpdate = true;
      const cursorPos = editor.selectionStart;
      const oldLength = editor.value.length;
      
      editor.value = text.toString();
      updateEditorState();
      
      // Try to preserve cursor position
      const newLength = editor.value.length;
      const delta = newLength - oldLength;
      const newPos = Math.max(0, Math.min(cursorPos + delta, newLength));
      editor.setSelectionRange(newPos, newPos);
      
      isRemoteUpdate = false;
    });

    // ===== WEBSOCKET =====
    function connect() {
      setConnectionStatus('connecting');
      isSynced = false;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = protocol + '//' + window.location.host + '/d/' + docId + '/ws';

      ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        console.log('WebSocket connected');
        setConnectionStatus('connected');
        reconnectAttempts = 0;

        // Request initial sync
        requestSync();
      };

      ws.onmessage = (event) => {
        // Binary message = Yjs sync
        if (event.data instanceof ArrayBuffer) {
          const data = new Uint8Array(event.data);
          handleBinaryMessage(data);
        }
        // String message = JSON
        else if (typeof event.data === 'string') {
          try {
            const message = JSON.parse(event.data);
            handleJsonMessage(message);
          } catch (err) {
            console.error('Invalid JSON message:', err);
          }
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        setConnectionStatus('disconnected');
        ws = null;
        scheduleReconnect();
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    }

    function scheduleReconnect() {
      if (reconnectTimeout) return;

      // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
      reconnectAttempts++;

      console.log('Reconnecting in ' + delay + 'ms...');
      reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null;
        connect();
      }, delay);
    }

    function requestSync() {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MessageType.SYNC_STEP1);
      ws.send(encoding.toUint8Array(encoder));
    }

    function handleBinaryMessage(data) {
      const decoder = decoding.createDecoder(data);
      const messageType = decoding.readVarUint(decoder);

      if (messageType === MessageType.SYNC_STEP2 || messageType === MessageType.UPDATE) {
        // Apply the update
        const update = decoding.readVarUint8Array(decoder);
        
        try {
          Y.applyUpdate(doc, update, 'remote');
          
          if (!isSynced && messageType === MessageType.SYNC_STEP2) {
            isSynced = true;
            // Send our local state too (in case we have unsaved changes)
            sendLocalState();
          }
        } catch (err) {
          console.error('Failed to apply Yjs update:', err);
        }
      }
    }

    function handleJsonMessage(message) {
      switch (message.type) {
        case 'meta':
          expiresAt = message.expiresAt;
          updateTimer();
          break;

        case 'presence':
          updatePresence(message.count);
          break;

        case 'expired':
          alert('This document has expired.');
          window.location.href = '/';
          break;

        case 'error':
          console.error('Server error:', message.message);
          if (message.message.includes('size limit')) {
            alert('Document size limit exceeded (512KB). Some changes may not be saved.');
          }
          break;
      }
    }

    function sendLocalState() {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const state = Y.encodeStateAsUpdate(doc);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MessageType.UPDATE);
      encoding.writeVarUint8Array(encoder, state);

      ws.send(encoding.toUint8Array(encoder));
    }

    // Send updates when local changes happen
    doc.on('update', (update, origin) => {
      if (origin === 'remote') return;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MessageType.UPDATE);
      encoding.writeVarUint8Array(encoder, update);

      ws.send(encoding.toUint8Array(encoder));
    });

    // Start connection
    connect();

    // Initialize editor state
    updateEditorState();

    // Focus editor
    editor.focus();

    // Handle window resize
    window.addEventListener('resize', updateEditorState);

    // Handle page visibility
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          connect();
        }
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Cmd/Ctrl+S to download
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        const a = document.createElement('a');
        a.href = '/d/' + docId + '/raw';
        a.download = 'document.md';
        a.click();
      }
    });
  `;
}
