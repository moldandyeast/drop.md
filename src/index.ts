import { Env, CreateDocRequest, isValidTTL } from './types';
import { generateId, isValidId } from './utils/id';
import { checkRateLimit, getRateLimitHeaders } from './utils/rate-limit';
import { landingPage } from './html/landing';
import { editorPage } from './html/editor';
import { notFoundPage } from './html/not-found';

// Re-export Durable Object class
export { Document } from './document';

/**
 * Worker entry point
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // CORS headers for all responses
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      };

      // Handle CORS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }

      // Route: Landing page
      if (path === '/' && request.method === 'GET') {
        return new Response(landingPage(), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }

      // Route: Create new document
      if (path === '/api/docs' && request.method === 'POST') {
        // Rate limiting
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const rateLimit = checkRateLimit(ip);
        
        if (!rateLimit.allowed) {
          return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              ...getRateLimitHeaders(rateLimit),
              ...corsHeaders,
            },
          });
        }

        // Parse request
        let body: CreateDocRequest;
        try {
          body = await request.json() as CreateDocRequest;
        } catch {
          return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }

        // Validate TTL
        if (!isValidTTL(body.ttl)) {
          return new Response(JSON.stringify({ error: 'Invalid TTL. Use 24h, 7d, or 30d' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }

        // Generate ID and create document
        const id = generateId();
        const docId = env.DOCUMENT.idFromName(id);
        const doc = env.DOCUMENT.get(docId);

        // Initialize the document in the Durable Object
        const initResponse = await doc.fetch(new Request('https://internal/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ttl: body.ttl }),
        }));

        if (!initResponse.ok) {
          return new Response(JSON.stringify({ error: 'Failed to create document' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }

        const initData = await initResponse.json() as { expiresAt: number };

        // Build the URL
        const docUrl = `${url.origin}/d/${id}`;

        return new Response(JSON.stringify({
          id,
          url: docUrl,
          expiresAt: initData.expiresAt,
        }), {
          status: 201,
          headers: {
            'Content-Type': 'application/json',
            ...getRateLimitHeaders(rateLimit),
            ...corsHeaders,
          },
        });
      }

      // Route: Document page
      const docMatch = path.match(/^\/d\/([a-zA-Z0-9]+)$/);
      if (docMatch && request.method === 'GET') {
        const id = docMatch[1];
        
        if (!isValidId(id)) {
          return new Response(notFoundPage(), {
            status: 404,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }

        // Check if document exists by fetching metadata
        const docId = env.DOCUMENT.idFromName(id);
        const doc = env.DOCUMENT.get(docId);
        
        const metaResponse = await doc.fetch(new Request('https://internal/meta'));
        
        if (!metaResponse.ok) {
          return new Response(notFoundPage(), {
            status: 404,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }

        const meta = await metaResponse.json() as { expiresAt: number; ttl: string };

        return new Response(editorPage(id, meta.expiresAt, meta.ttl), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }

      // Route: Raw markdown download
      const rawMatch = path.match(/^\/d\/([a-zA-Z0-9]+)\/raw$/);
      if (rawMatch && request.method === 'GET') {
        const id = rawMatch[1];
        
        if (!isValidId(id)) {
          return new Response('Not Found', { status: 404 });
        }

        const docId = env.DOCUMENT.idFromName(id);
        const doc = env.DOCUMENT.get(docId);
        
        return doc.fetch(new Request('https://internal/raw'));
      }

      // Route: WebSocket connection
      const wsMatch = path.match(/^\/d\/([a-zA-Z0-9]+)\/ws$/);
      if (wsMatch) {
        const id = wsMatch[1];
        
        if (!isValidId(id)) {
          return new Response('Not Found', { status: 404 });
        }

        // Check for WebSocket upgrade
        const upgradeHeader = request.headers.get('Upgrade');
        if (upgradeHeader !== 'websocket') {
          return new Response('Expected WebSocket', { status: 426 });
        }

        const docId = env.DOCUMENT.idFromName(id);
        const doc = env.DOCUMENT.get(docId);
        
        return doc.fetch(new Request('https://internal/ws', {
          headers: request.headers,
        }));
      }

      // 404 for everything else
      return new Response(notFoundPage(), {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};
