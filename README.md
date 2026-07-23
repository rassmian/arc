# ARC Raiders Event Tracker

A single-page tracker for ARC Raiders map events (Night Raid, Matriarch, Harvester, and the rest),
showing what's happening today across all maps with live countdowns in UK time.

Live at: `https://<your-github-username>.github.io/<repo-name>/`

## How it's wired together

```
Browser (index.html)
      │
      │  fetch()
      ▼
Cloudflare Worker  ──────►  MetaForge API
(worker.js)                (metaforge.app)
```

The page can't call MetaForge's API directly — their server blocks plain
cross-origin browser requests. The Cloudflare Worker sits in between: it calls
MetaForge server-to-server (no CORS involved) and hands the JSON back to the
page with permissive CORS headers.

- `index.html` — the tracker itself. Deployed via GitHub Pages.
- `worker.js` — the Cloudflare Worker proxy. **Not deployed from this repo** —
  it's a backup copy. The live version lives in the Cloudflare dashboard under
  Workers & Pages.

## If the Worker ever needs recreating

1. Cloudflare dashboard → Workers & Pages → Create → "Start with Hello World!"
2. Delete the placeholder code, paste in `worker.js`
3. Deploy
4. Copy the new `*.workers.dev` URL
5. In `index.html`, update the `WORKER_URL` constant near the top of the
   `<script>` block to the new URL
6. Commit and push

## Data source

Event data comes from [MetaForge](https://metaforge.app/arc-raiders), a
community-maintained resource for ARC Raiders — not affiliated with Embark
Studios. Their API terms require attribution (already included in the page
footer) and require permission before any monetized use. This project is
personal and non-commercial.

## Fallback behaviour

If the Worker is unreachable, `index.html` tries MetaForge directly, then a
public CORS proxy, then finally falls back to a static reference list of
known event types with no live times. Status of which source is active shows
in the bar under the header.
