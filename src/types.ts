/**
 * TTL options for document expiry
 */
export type TTL = '24h' | '7d' | '30d';

/**
 * Document metadata stored in Durable Object
 */
export interface DocumentMeta {
  createdAt: number;
  expiresAt: number;
  ttl: TTL;
}

/**
 * Request to create a new document
 */
export interface CreateDocRequest {
  ttl: TTL;
}

/**
 * Response after creating a document
 */
export interface CreateDocResponse {
  id: string;
  url: string;
  expiresAt: number;
}

/**
 * WebSocket message types from server to client
 */
export type ServerMessage =
  | { type: 'meta'; expiresAt: number; ttl: TTL }
  | { type: 'presence'; count: number }
  | { type: 'expired' }
  | { type: 'error'; message: string };

/**
 * WebSocket message types from client to server
 */
export type ClientMessage =
  | { type: 'awareness'; state: Record<string, unknown> };

/**
 * Environment bindings for the Worker
 */
export interface Env {
  DOCUMENT: DurableObjectNamespace;
  ENVIRONMENT: string;
}

/**
 * Convert TTL string to milliseconds
 */
export function ttlToMs(ttl: TTL): number {
  switch (ttl) {
    case '24h':
      return 24 * 60 * 60 * 1000;
    case '7d':
      return 7 * 24 * 60 * 60 * 1000;
    case '30d':
      return 30 * 24 * 60 * 60 * 1000;
  }
}

/**
 * Validate TTL value
 */
export function isValidTTL(value: unknown): value is TTL {
  return value === '24h' || value === '7d' || value === '30d';
}
