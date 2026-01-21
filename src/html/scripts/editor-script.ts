/**
 * Editor page JavaScript
 * 
 * Uses Yjs for CRDT-based real-time sync over WebSocket.
 */
export function editorScript(docId: string): string {
  return `
    // Import Yjs from CDN
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
      SYNC_STEP1: 0,
      SYNC_STEP2: 1,
      UPDATE: 2,
    };

    // lib0-compatible encoding
    function encodeMessage(type, data) {
      const arr = [];
      // Write varint for message type
      let n = type;
      while (n > 127) {
        arr.push((n & 127) | 128);
        n = Math.floor(n / 128);
      }
      arr.push(n & 127);
      
      if (data) {
        // Write varint for length
        let len = data.length;
        while (len > 127) {
          arr.push((len & 127) | 128);
          len = Math.floor(len / 128);
        }
        arr.push(len & 127);
        // Write data
        for (let i = 0; i < data.length; i++) {
          arr.push(data[i]);
        }
      }
      return new Uint8Array(arr);
    }

    function decodeMessage(data) {
      let pos = 0;
      // Read varint for message type
      let type = 0;
      let mult = 1;
      while (true) {
        const byte = data[pos++];
        type += (byte & 127) * mult;
        if (byte < 128) break;
        mult *= 128;
      }
      
      // Read varint for length
      let len = 0;
      mult = 1;
      while (true) {
        const byte = data[pos++];
        len += (byte & 127) * mult;
        if (byte < 128) break;
        mult *= 128;
      }
      
      // Read data
      const payload = data.slice(pos, pos + len);
      return { type, payload };
    }

    // State
    const doc = new Y.Doc();
    const text = doc.getText('content');
    let ws = null;
    let isSynced = false;
    let reconnectAttempts = 0;
    let reconnectTimeout = null;
    let expiresAt = parseInt(timer.dataset.expires, 10);
    let isUpdatingEditor = false;

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

      timer.classList.remove('warning', 'danger');
      if (remaining < 60 * 60 * 1000) {
        timer.classList.add('danger');
      } else if (remaining < 24 * 60 * 60 * 1000) {
        timer.classList.add('warning');
      }
    }

    updateTimer();
    setInterval(updateTimer, 60000);

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

      dotsContainer.innerHTML = '';
      for (let i = 0; i < Math.min(count, 5); i++) {
        const dot = document.createElement('span');
        dot.className = 'presence-dot';
        dotsContainer.appendChild(dot);
      }

      textEl.textContent = count === 1 ? '1' : count.toString();
    }

    // ===== EDITOR LAYOUT =====
    const editorScroll = document.getElementById('editor-scroll');
    const spacerTop = document.querySelector('.editor-spacer-top');

    function autoResize() {
      editor.style.height = 'auto';
      editor.style.height = editor.scrollHeight + 'px';
    }

    function updateEditorLayout() {
      autoResize();
      
      const viewportHeight = editorScroll.clientHeight;
      const contentHeight = editor.scrollHeight;
      const maxSpacer = viewportHeight * 0.45;
      const minSpacer = 32;
      const ratio = Math.min(contentHeight / (viewportHeight * 0.5), 1);
      const spacerHeight = maxSpacer - (ratio * (maxSpacer - minSpacer));
      
      spacerTop.style.minHeight = Math.max(spacerHeight, minSpacer) + 'px';
    }

    // ===== YTEXT <-> TEXTAREA BINDING =====
    // Proper binding that computes minimal diffs
    
    function applyDiff(oldText, newText, ytext) {
      // Find common prefix
      let start = 0;
      while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) {
        start++;
      }
      
      // Find common suffix
      let oldEnd = oldText.length;
      let newEnd = newText.length;
      while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) {
        oldEnd--;
        newEnd--;
      }
      
      // Apply changes
      const deleteCount = oldEnd - start;
      const insertText = newText.slice(start, newEnd);
      
      if (deleteCount > 0 || insertText.length > 0) {
        doc.transact(() => {
          if (deleteCount > 0) {
            ytext.delete(start, deleteCount);
          }
          if (insertText.length > 0) {
            ytext.insert(start, insertText);
          }
        }, 'local');
      }
    }
    
    let lastKnownText = '';
    
    editor.addEventListener('input', () => {
      if (isUpdatingEditor) return;
      
      const newText = editor.value;
      applyDiff(lastKnownText, newText, text);
      lastKnownText = newText;
      
      updateEditorLayout();
    });

    // When Yjs doc changes, update editor
    text.observe((event) => {
      if (event.transaction.origin === 'local') return;
      
      isUpdatingEditor = true;
      
      const newText = text.toString();
      const cursorPos = editor.selectionStart;
      const cursorEnd = editor.selectionEnd;
      
      // Calculate cursor adjustment based on changes before cursor
      let adjustment = 0;
      let pos = 0;
      for (const delta of event.changes.delta) {
        if (delta.retain) {
          pos += delta.retain;
        } else if (delta.insert) {
          const insertLen = typeof delta.insert === 'string' ? delta.insert.length : delta.insert.length;
          if (pos <= cursorPos) {
            adjustment += insertLen;
          }
          pos += insertLen;
        } else if (delta.delete) {
          if (pos < cursorPos) {
            adjustment -= Math.min(delta.delete, cursorPos - pos);
          }
        }
      }
      
      editor.value = newText;
      lastKnownText = newText;
      
      // Restore cursor with adjustment
      const newCursorPos = Math.max(0, Math.min(cursorPos + adjustment, newText.length));
      const newCursorEnd = Math.max(0, Math.min(cursorEnd + adjustment, newText.length));
      editor.setSelectionRange(newCursorPos, newCursorEnd);
      
      updateEditorLayout();
      isUpdatingEditor = false;
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
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          const data = new Uint8Array(event.data);
          handleBinaryMessage(data);
        } else if (typeof event.data === 'string') {
          try {
            handleJsonMessage(JSON.parse(event.data));
          } catch (err) {
            console.error('Invalid JSON:', err);
          }
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code);
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
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
      reconnectAttempts++;
      console.log('Reconnecting in ' + delay + 'ms...');
      reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null;
        connect();
      }, delay);
    }

    function handleBinaryMessage(data) {
      const { type, payload } = decodeMessage(data);

      if (type === MessageType.SYNC_STEP2 || type === MessageType.UPDATE) {
        try {
          Y.applyUpdate(doc, payload, 'remote');
          
          if (!isSynced && type === MessageType.SYNC_STEP2) {
            isSynced = true;
            // Sync local state back
            lastKnownText = text.toString();
            editor.value = lastKnownText;
            updateEditorLayout();
            sendUpdate(Y.encodeStateAsUpdate(doc));
          }
        } catch (err) {
          console.error('Failed to apply update:', err);
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
          break;
      }
    }

    function sendUpdate(update) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(encodeMessage(MessageType.UPDATE, update));
    }

    // Send Yjs updates to server
    doc.on('update', (update, origin) => {
      if (origin === 'remote') return;
      sendUpdate(update);
    });

    // Start
    connect();
    updateEditorLayout();
    editor.focus();

    window.addEventListener('resize', updateEditorLayout);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && (!ws || ws.readyState !== WebSocket.OPEN)) {
        connect();
      }
    });

    document.addEventListener('keydown', (e) => {
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
