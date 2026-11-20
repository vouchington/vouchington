# Web

- Product contracts: [requirements index](../docs/requirements/README.md). Never commit screenshots.
- Database lists server-render page one and support cursor continuation.
- Server components use `getCurrentUser()`; clients use `useAuth()` without `currentUser` crossing
  RSC/client boundaries.
- Mutations call client API helpers, never inline `'use server'` proxies. Routes, visible text, and
  inputs never expose UUIDs as the identifier, not even truncated ones; slug routes accept a UUID
  only as a fallback that redirects to the canonical slug.
- Browser config uses runtime public bootstrap (`IMAGE_ORIGIN` pattern), never new Docker build
  args or `NEXT_PUBLIC_*` values.
- The Cloudflare Worker alone owns HTTP caching; Next.js never emits `Cache-Control`.
- React Compiler is enabled; avoid identity-only memoization.
- Never display raw `topic.name` for RSS-feed topics: stored names contain identity URLs. UI uses
  `getTopicDisplayName(topic, { feedType? })`/`getTopicDisplayTitle(topic)`; SEO title/JSON-LD use
  the URL-stripped, kind-free `getTopicDisplayTitle`. Identity/input surfaces (autocomplete keys,
  settings defaults, merge confirmation) keep raw names.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
