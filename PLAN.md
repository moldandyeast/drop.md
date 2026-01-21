# drop.md — Implementation Plan

## Overview

Ephemeral shared markdown. Create, share, disappear.

**Core values:**
- **Fast** — Edge-first, no spinners, instant load
- **Minimal** — One purpose, zero configuration
- **Robust** — CRDTs handle conflicts, alarms handle cleanup
- **Scalable** — Each doc is isolated in its own Durable Object

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLOUDFLARE EDGE                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Worker (src/index.ts)                        │   │
│  │                                                                      │   │
│  │   Routes:                                                            │   │
│  │   ├─ GET  /              → Landing page (static HTML)               │   │
│  │   ├─ POST /api/docs      → Create new doc, return ID                │   │
│  │   ├─ GET  /d/:id         → Editor page (static HTML + hydrate)      │   │
│  │   ├─ GET  /d/:id/raw     → Download raw .md                         │   │
│  │   └─ WS   /d/:id/ws      → WebSocket → Durable Object               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Durable Object (per document)                     │   │
│  │                                                                      │   │
│  │   State:                                                             │   │
│  │   ├─ Y.Doc (CRDT state)                                             │   │
│  │   ├─ createdAt: timestamp                                           │   │
│  │   ├─ expiresAt: timestamp                                           │   │
│  │   ├─ ttl: '24h' | '7d' | '30d'                                      │   │
│  │   └─ connections: Set<WebSocket>                                    │   │
│  │                                                                      │   │
│  │   Responsibilities:                                                  │   │
│  │   ├─ Accept WebSocket connections                                   │   │
│  │   ├─ Sync Yjs updates between clients                               │   │
│  │   ├─ Persist state to Durable Object storage                        │   │
│  │   ├─ Track presence (connection count)                              │   │
│  │   └─ Self-destruct via alarm when expired                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Runtime | Cloudflare Workers | Edge-first, fast cold starts (~0ms), global |
| State | Durable Objects | Single-threaded per doc, built-in persistence, WebSocket support |
| CRDT | Yjs | Battle-tested, compact encoding, excellent performance |
| IDs | nanoid | Short, URL-safe, 21 chars default (collision-resistant) |
| Frontend | Vanilla JS + Yjs | No framework overhead, instant load |
| Styling | Plain CSS | Single file, no build step for styles |

---

## Project Structure

```
multiplayer_md/
├── src/
│   ├── index.ts              # Worker entry point, routing
│   ├── document.ts           # Durable Object class
│   ├── types.ts              # TypeScript types
│   ├── utils/
│   │   ├── id.ts             # ID generation (nanoid)
│   │   └── rate-limit.ts     # Rate limiting logic
│   └── html/
│       ├── landing.ts        # Landing page HTML
│       └── editor.ts         # Editor page HTML
├── public/
│   ├── styles.css            # All styles
│   ├── landing.js            # Landing page JS (minimal)
│   └── editor.js             # Editor JS (Yjs, WebSocket)
├── wrangler.toml             # Cloudflare config
├── package.json
├── tsconfig.json
└── PLAN.md
```

---

## Data Flow

### Create Document

```
1. User selects TTL (24h / 7d / 30d)
2. POST /api/docs { ttl: '7d' }
3. Worker generates ID (nanoid)
4. Worker creates Durable Object stub (lazy init)
5. Returns { id, url }
6. Client redirects to /d/:id
```

### Edit Document

```
1. User opens /d/:id
2. Page loads, connects WebSocket to /d/:id/ws
3. Durable Object:
   - If first connection: load state from storage, init Y.Doc
   - Send current Y.Doc state to client (sync step 1)
4. Client applies state, sends any local changes
5. DO broadcasts updates to all connected clients
6. DO debounce-persists state to storage (every 2s if dirty)
```

### Self-Destruct

```
1. On doc creation: DO.state.storage.setAlarm(expiresAt)
2. When alarm fires: alarm() method called
3. DO deletes all storage keys
4. DO closes all connections with "expired" message
5. Next request to this ID → 404
```

---

## WebSocket Protocol

### Message Types (Client → Server)

```typescript
// Yjs sync message (binary)
Uint8Array  // Yjs encoded update/sync

// JSON messages
{ type: 'awareness', state: object }  // Cursor position, selection
```

### Message Types (Server → Client)

```typescript
// Yjs sync message (binary)
Uint8Array  // Yjs encoded update/sync

// JSON messages
{ type: 'meta', expiresAt: number, ttl: string }
{ type: 'presence', count: number }
{ type: 'expired' }  // Doc has been deleted
{ type: 'error', message: string }
```

---

## Design Decisions

### 1. ID Generation
- Use `nanoid` with custom alphabet (no confusing chars: 0O1lI)
- 10 characters = 64^10 = ~10^18 combinations
- Prefix with creation timestamp for sortability? No — keep it minimal

### 2. Max Document Size
- **Decision: 512KB** 
- Rationale: Large enough for any reasonable markdown doc, small enough to prevent abuse
- Enforcement: Check Yjs state size before persisting, reject updates that exceed

### 3. Presence
- **Decision: Count only ("2 here"), no cursors**
- Rationale: Cursors add complexity, visual noise, and sync overhead
- Simple presence via WebSocket connection count

### 4. Rate Limiting
- **Per-IP:** Max 10 docs/hour
- **Per-doc:** Max 100 connections
- **Implemented via:** Cloudflare Rate Limiting rules + in-worker checks

### 5. Custom Slugs
- **Decision: Random IDs only (for v1)**
- Rationale: Custom slugs invite squatting, require availability checks
- Future: Could add as paid feature

### 6. Extend Expiry
- **Decision: No extension (for v1)**
- Rationale: Core concept is ephemerality; extension undermines it
- Users can copy content to new doc if needed

### 7. Error Handling
- Doc not found → Clean 404 page with "create new" CTA
- Doc expired → Same as not found (no distinction)
- WebSocket disconnect → Auto-reconnect with exponential backoff

---

## UI/UX Specifications

### Typography
- **Font:** JetBrains Mono (or fallback: monospace)
- **Why:** Beautiful, readable, designed for code/markdown
- **Sizes:** 
  - Body: 15px
  - Headers: relative (em)

### Colors (Dark theme, terminal-inspired)
```css
--bg:       #0a0a0a;    /* Near black */
--surface:  #141414;    /* Slightly lighter */
--border:   #262626;    /* Subtle borders */
--text:     #e5e5e5;    /* Off-white */
--muted:    #737373;    /* Subdued text */
--accent:   #22d3ee;    /* Cyan accent (time, links) */
--danger:   #f87171;    /* Red for expiry warning */
```

### Landing Page
- Centered, single column
- Large "drop.md" title
- Tagline: "shared markdown that disappears"
- TTL buttons: toggle group, single selection
- Create button: prominent, instant feedback
- No navigation, no footer cruft

### Editor Page
- **Header:** 
  - Left: doc URL (click to copy, with feedback)
  - Right: download .md button, time remaining
- **Body:**
  - Full-screen textarea, no chrome
  - Monospace font
  - Subtle line height for readability
- **Footer:**
  - Presence indicator: "●● 2 here" or "● 1 here"
  - Minimal, doesn't distract

### Animations
- Page transitions: none (instant)
- Button states: subtle color transitions (150ms)
- Copy feedback: brief checkmark animation
- Time remaining: pulses when < 1 hour

---

## Security Considerations

1. **No authentication = no authorization**
   - Anyone with link can read/write
   - This is intentional — the link IS the auth
   - Make IDs long enough to prevent guessing (10+ chars)

2. **Content sanitization**
   - Raw markdown only, no HTML rendering
   - Download is raw .md file
   - No XSS vector since we don't render user content as HTML

3. **Rate limiting**
   - Prevent doc creation spam
   - Prevent WebSocket connection floods
   - Use Cloudflare's built-in protection + custom limits

4. **Storage limits**
   - Cap doc size at 512KB
   - Durable Objects have 128KB value limit — store as chunks

---

## Implementation Order

### Phase 1: Core Infrastructure
1. ✅ Project setup (wrangler, tsconfig, package.json)
2. ✅ Durable Object skeleton
3. ✅ Worker routing
4. ✅ WebSocket handling

### Phase 2: Document Logic
5. ✅ Yjs integration
6. ✅ State persistence
7. ✅ Alarm-based expiry

### Phase 3: Frontend
8. ✅ Landing page
9. ✅ Editor page
10. ✅ Styling

### Phase 4: Polish
11. Rate limiting
12. Error handling
13. Testing
14. Documentation

---

## Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Show cursors? | No, count only |
| Max doc size? | 512KB |
| Rate limiting? | 10 docs/hour/IP |
| Custom slugs? | No (v1) |
| Extend expiry? | No (v1) |

---

## Future Considerations (Not v1)

- [ ] Custom slugs (paid?)
- [ ] Password protection
- [ ] Read-only sharing
- [ ] Export to other formats
- [ ] Embed support
- [ ] API for programmatic access

---

## Success Metrics

1. **Performance:** < 100ms to interactive on 3G
2. **Reliability:** 99.9% uptime (Cloudflare SLA)
3. **Simplicity:** < 5 seconds to create and share a doc
4. **Scale:** Handle 10K concurrent docs, 100K daily

---

*Let's build something beautiful.*
