# Web App Routes

Next.js App Router tree. Top-level directories beginning with `(group)` are
[route groups](https://nextjs.org/docs/app/building-your-application/routing/route-groups) — they
do **not** add a URL segment. Some groups (e.g. `(my)`, `(growth)`, `(chat)`) define a shared
`layout.tsx`; others are organizational only.

Full route catalogue (with auth/permission rules and metadata expectations):
[`../../docs/requirements/navigation/ROUTES.md`](../../docs/requirements/navigation/ROUTES.md).

## Route Groups

| Group                               | Purpose                                                           |
| ----------------------------------- | ----------------------------------------------------------------- |
| [`(public)/`](<(public)>)           | Public marketing/info shell (e.g. `/plans`).                      |
| [`(my)/`](<(my)>)                   | Signed-in `/my/*` settings, bookmarks, subscriptions, history.    |
| [`(topics)/`](<(topics)>)           | Topic detail and per-topic post routes (`/[topicType]/[id]/...`). |
| [`(communities)/`](<(communities)>) | Communities (`/communities/*`).                                   |
| [`(chat)/`](<(chat)>)               | LLM chat surface.                                                 |
| [`(growth)/`](<(growth)>)           | Acquisition/growth experiments and landings.                      |
| [`(posts)/`](<(posts)>)             | Post creation/edit forms.                                         |
| [`(user)/`](<(user)>)               | Public user profiles (`/user/[idOrUsername]`).                    |

## Top-Level Routes

| Path                                               | Purpose                                        |
| -------------------------------------------------- | ---------------------------------------------- |
| [`admin/`](admin/)                                 | Admin-only tooling (auth-gated).               |
| [`auth/`](auth/)                                   | OAuth callback pages.                          |
| [`compare/`](compare/)                             | Side-by-side topic comparison.                 |
| [`feed/`](feed/)                                   | Personalized feed.                             |
| [`login/`](login/)                                 | Sign-in surface (full-screen, bypasses shell). |
| [`news/`](news/)                                   | RSS news feed surface.                         |
| [`notification-redirect/`](notification-redirect/) | Notification deep-link bouncer (full-screen).  |
| [`topic-recommendations/`](topic-recommendations/) | Wikipedia-recommendation pages.                |

## Top-Level Files

- [`layout.tsx`](layout.tsx) — root layout. Renders the sidebar + aside + footer shell for the standard app, with a conditional standalone branch for landing pages.
- [`page.tsx`](page.tsx) — homepage.
- [`not-found.tsx`](not-found.tsx), [`forbidden.tsx`](forbidden.tsx), [`unauthorized.tsx`](unauthorized.tsx) — Next.js error boundaries.
- [`robots.ts`](robots.ts), [`manifest.ts`](manifest.ts) — SEO/social metadata. OG/Twitter share-card images are a signed `/og/` route rendered by the image-resize lambda; see [`../lib/seo/og-image-url.ts`](../lib/seo/og-image-url.ts).
- [`globals.css`](globals.css) — Tailwind + plugin registrations.

## Related

- Web rules: [`../CLAUDE.md`](../CLAUDE.md)
- Component requirements: [`../../docs/requirements/navigation/COMPONENTS.md`](../../docs/requirements/navigation/COMPONENTS.md)
- Aside inventory: [`../../docs/requirements/navigation/ASIDES.md`](../../docs/requirements/navigation/ASIDES.md)
