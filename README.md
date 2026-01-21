# drop.md

Ephemeral multiplayer markdown. Create, share, disappear.

## The idea

A link. Anyone with it can edit. Real-time sync. Self-destructs.

No accounts. No config. No bullshit.

## Stack

- **Cloudflare Workers** — runs at the edge, sub-10ms cold starts
- **Durable Objects** — one per doc, handles WebSocket + state
- **Yjs** — CRDT, no conflicts, no locks
- **Alarms** — auto-delete when time's up

## How it works

```
You → create doc (pick 24h / 7d / 30d)
    → get link
    → share it
    → collaborate in real-time
    → download .md anytime
    → doc vanishes when expired
```

## Run it

```bash
npm install
npm run dev
# → http://localhost:8787
```

## Deploy it

```bash
npm run deploy
```

Needs a Cloudflare account. Free tier works.

## What's intentionally missing

- Accounts
- Permissions
- History
- Folders
- Comments
- Formatting toolbar
- Settings
- Export options
- Search
- Analytics

## License

MIT
