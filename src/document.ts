import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { DocumentMeta, TTL, ttlToMs, isValidTTL, ServerMessage } from './types';

/**
 * Message types for our WebSocket protocol
 */
const MessageType = {
  SYNC_STEP1: 0,   // Request state vector
  SYNC_STEP2: 1,   // Send state update
  UPDATE: 2,       // Incremental update
} as const;

/**
 * Maximum document size in bytes (512KB)
 */
const MAX_DOC_SIZE = 512 * 1024;

/**
 * How often to persist state to storage (ms)
 */
const PERSIST_DEBOUNCE = 2000;

/**
 * Maximum connections per document
 */
const MAX_CONNECTIONS = 100;

/**
 * Durable Object for a single document
 * 
 * Each document gets its own DO instance, which:
 * - Manages the Yjs CRDT state
 * - Handles WebSocket connections
 * - Persists state to durable storage
 * - Self-destructs when expired via alarm
 */
export class Document {
  private state: DurableObjectState;
  private doc: Y.Doc | null = null;
  private meta: DocumentMeta | null = null;
  private persistTimeout: ReturnType<typeof setTimeout> | null = null;
  private isDirty = false;
  private initialized = false;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  /**
   * Initialize the document state from storage
   */
  private async initialize(): Promise<boolean> {
    if (this.initialized) return this.meta !== null;

    this.initialized = true;

    // Load metadata
    const meta = await this.state.storage.get<DocumentMeta>('meta');
    if (!meta) {
      return false; // Document doesn't exist
    }

    // Check if expired
    if (Date.now() >= meta.expiresAt) {
      await this.destroy();
      return false;
    }

    this.meta = meta;

    // Load Yjs state
    const stateData = await this.state.storage.get<Uint8Array>('state');
    this.doc = new Y.Doc();
    
    if (stateData) {
      Y.applyUpdate(this.doc, new Uint8Array(stateData));
    }

    // Listen for updates to broadcast and persist
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      // Broadcast to all clients except the origin
      this.broadcastUpdate(update, origin as WebSocket | null);
      
      // Mark dirty and schedule persist
      this.schedulePersist();
    });

    return true;
  }

  /**
   * Create a new document
   */
  private async create(ttl: TTL): Promise<void> {
    const now = Date.now();
    
    this.meta = {
      createdAt: now,
      expiresAt: now + ttlToMs(ttl),
      ttl,
    };

    this.doc = new Y.Doc();
    
    // Initialize with empty text
    this.doc.getText('content');

    // Listen for updates
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      this.broadcastUpdate(update, origin as WebSocket | null);
      this.schedulePersist();
    });

    // Persist immediately
    await this.persist();

    // Set alarm for expiry
    await this.state.storage.setAlarm(this.meta.expiresAt);

    this.initialized = true;
  }

  /**
   * Schedule a debounced persist
   */
  private schedulePersist(): void {
    this.isDirty = true;
    
    if (this.persistTimeout) return;

    this.persistTimeout = setTimeout(async () => {
      this.persistTimeout = null;
      if (this.isDirty) {
        await this.persist();
      }
    }, PERSIST_DEBOUNCE);
  }

  /**
   * Persist current state to storage
   */
  private async persist(): Promise<void> {
    if (!this.doc || !this.meta) return;

    const state = Y.encodeStateAsUpdate(this.doc);
    
    // Check size limit
    if (state.byteLength > MAX_DOC_SIZE) {
      // Notify all clients of the error
      this.broadcastMessage({ type: 'error', message: 'Document size limit exceeded (512KB)' });
      return;
    }

    await this.state.storage.put({
      meta: this.meta,
      state: state,
    });

    this.isDirty = false;
  }

  /**
   * Get all active WebSocket connections (handles hibernation)
   */
  private getConnections(): WebSocket[] {
    return this.state.getWebSockets();
  }

  /**
   * Broadcast a Yjs update to all connected clients
   */
  private broadcastUpdate(update: Uint8Array, exclude: WebSocket | null): void {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MessageType.UPDATE);
    encoding.writeVarUint8Array(encoder, update);
    const message = encoding.toUint8Array(encoder);

    for (const ws of this.getConnections()) {
      if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  /**
   * Send full sync (step 2) to a specific client
   */
  private sendSync(ws: WebSocket): void {
    if (!this.doc || ws.readyState !== WebSocket.OPEN) return;

    const state = Y.encodeStateAsUpdate(this.doc);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MessageType.SYNC_STEP2);
    encoding.writeVarUint8Array(encoder, state);
    
    ws.send(encoding.toUint8Array(encoder));
  }

  /**
   * Broadcast a JSON message to all connected clients
   */
  private broadcastMessage(message: ServerMessage): void {
    const data = JSON.stringify(message);
    for (const ws of this.getConnections()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  /**
   * Broadcast presence count to all clients
   */
  private broadcastPresence(): void {
    this.broadcastMessage({ type: 'presence', count: this.getConnections().length });
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(ws: WebSocket, data: ArrayBuffer | string): void {
    if (!this.doc) return;

    // Binary message = Yjs sync
    if (data instanceof ArrayBuffer) {
      const uint8 = new Uint8Array(data);
      const decoder = decoding.createDecoder(uint8);
      const messageType = decoding.readVarUint(decoder);

      switch (messageType) {
        case MessageType.SYNC_STEP1: {
          // Client is requesting full state
          this.sendSync(ws);
          break;
        }
        case MessageType.SYNC_STEP2:
        case MessageType.UPDATE: {
          // Client is sending update
          const update = decoding.readVarUint8Array(decoder);
          Y.applyUpdate(this.doc, update, ws);
          break;
        }
      }
    }
    // String message = JSON (awareness, etc.)
    else if (typeof data === 'string') {
      try {
        const message = JSON.parse(data);
        // Handle awareness/presence if needed in the future
        if (message.type === 'awareness') {
          // Could implement cursor sharing here
        }
      } catch {
        // Invalid JSON, ignore
      }
    }
  }

  /**
   * Destroy this document and all its data
   */
  private async destroy(): Promise<void> {
    // Close all connections first
    for (const ws of this.getConnections()) {
      try {
        ws.send(JSON.stringify({ type: 'expired' }));
        ws.close(1000, 'Document expired');
      } catch {
        // Ignore errors when closing
      }
    }

    // Clear storage
    await this.state.storage.deleteAll();

    // Clear state
    this.doc = null;
    this.meta = null;
  }

  /**
   * Alarm handler - called when document expires
   */
  async alarm(): Promise<void> {
    await this.destroy();
  }

  /**
   * HTTP request handler
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // POST /create - Initialize a new document
    if (request.method === 'POST' && url.pathname === '/create') {
      try {
        const body = await request.json() as { ttl?: unknown };
        const ttl = body.ttl;

        if (!isValidTTL(ttl)) {
          return new Response(JSON.stringify({ error: 'Invalid TTL' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        await this.create(ttl);

        return new Response(JSON.stringify({ 
          success: true,
          expiresAt: this.meta!.expiresAt,
        }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to create document' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // GET /raw - Get raw markdown content
    if (request.method === 'GET' && url.pathname === '/raw') {
      const exists = await this.initialize();
      if (!exists || !this.doc) {
        return new Response('Not Found', { status: 404 });
      }

      const content = this.doc.getText('content').toString();
      return new Response(content, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': 'attachment; filename="document.md"',
        },
      });
    }

    // GET /meta - Get document metadata
    if (request.method === 'GET' && url.pathname === '/meta') {
      const exists = await this.initialize();
      if (!exists || !this.meta) {
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        expiresAt: this.meta.expiresAt,
        ttl: this.meta.ttl,
        createdAt: this.meta.createdAt,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // WebSocket upgrade for /ws
    if (url.pathname === '/ws') {
      // Check if document exists
      const exists = await this.initialize();
      if (!exists || !this.doc || !this.meta) {
        return new Response('Document not found', { status: 404 });
      }

      // Check connection limit
      if (this.getConnections().length >= MAX_CONNECTIONS) {
        return new Response('Too many connections', { status: 503 });
      }

      // Upgrade to WebSocket using hibernation API
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // Accept with hibernation support
      this.state.acceptWebSocket(server);

      // Send initial data immediately
      // Send document metadata
      server.send(JSON.stringify({
        type: 'meta',
        expiresAt: this.meta.expiresAt,
        ttl: this.meta.ttl,
      }));

      // Send full document state
      this.sendSync(server);

      // Broadcast updated presence to all
      this.broadcastPresence();

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('Not Found', { status: 404 });
  }

  /**
   * WebSocket message handler (for hibernation support)
   */
  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    await this.initialize();
    this.handleMessage(ws, message);
  }

  /**
   * WebSocket close handler (for hibernation support)
   */
  async webSocketClose(_ws: WebSocket): Promise<void> {
    // Connection is automatically removed by the runtime
    // Broadcast updated presence to remaining clients
    this.broadcastPresence();
  }

  /**
   * WebSocket error handler (for hibernation support)
   */
  async webSocketError(_ws: WebSocket): Promise<void> {
    // Connection is automatically removed by the runtime
    this.broadcastPresence();
  }
}
