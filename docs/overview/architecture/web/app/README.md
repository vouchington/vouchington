# Web App Routes

Source entrypoint: [web/app/README.md](../../../../../web/app/README.md)

Next.js App Router tree. Top-level directories beginning with `(group)` are
[route groups](https://nextjs.org/docs/app/building-your-application/routing/route-groups) — they
do **not** add a URL segment. Some groups (e.g. `(my)`, `(growth)`, `(chat)`) define a shared
`layout.tsx`; others are organizational only.

Full route catalogue (with auth/permission rules and metadata expectations):
[`../../docs/requirements/navigation/ROUTES.md`](../../../../requirements/navigation/ROUTES.md).

## Route Groups

| Group                                                      | Purpose                                                           |
| ---------------------------------------------------------- | ----------------------------------------------------------------- |
| [`(public)/`](<../../../../../web/app/(public)>)           | Public marketing/info shell (e.g. `/plans`).                      |
| [`(my)/`](<../../../../../web/app/(my)>)                   | Signed-in `/my/*` settings, bookmarks, subscriptions, history.    |
| [`(topics)/`](<../../../../../web/app/(topics)>)           | Topic detail and per-topic post routes (`/[topicType]/[id]/...`). |
| [`(communities)/`](<../../../../../web/app/(communities)>) | Communities (`/communities/*`).                                   |
| [`(chat)/`](<../../../../../web/app/(chat)>)               | LLM chat surface.                                                 |
| [`(growth)/`](<../../../../../web/app/(growth)>)           | Acquisition/growth experiments and landings.                      |
| [`(posts)/`](<../../../../../web/app/(posts)>)             | Post creation/edit forms.                                         |
| [`(user)/`](<../../../../../web/app/(user)>)               | Public user profiles (`/user/[idOrUsername]`).                    |

## Top-Level Routes

| Path                                                                      | Purpose                                        |
| ------------------------------------------------------------------------- | ---------------------------------------------- |
| [`admin/`](../../../../../web/app/admin/)                                 | Admin-only tooling (auth-gated).               |
| [`auth/`](../../../../../web/app/auth/)                                   | OAuth callback pages.                          |
| [`compare/`](../../../../../web/app/compare/)                             | Side-by-side topic comparison.                 |
| [`feed/`](../../../../../web/app/feed/)                                   | Personalized feed.                             |
| [`login/`](../../../../../web/app/login/)                                 | Sign-in surface (full-screen, bypasses shell). |
| [`news/`](../../../../../web/app/news/)                                   | RSS news feed surface.                         |
| [`notification-redirect/`](../../../../../web/app/notification-redirect/) | Notification deep-link bouncer (full-screen).  |
| [`topic-recommendations/`](../../../../../web/app/topic-recommendations/) | Topic recommendation list and creation pages.  |

## Top-Level Files

- [`layout.tsx`](../../../../../web/app/layout.tsx) — root layout. Renders the sidebar + aside + footer shell for the standard app, with a conditional standalone branch for landing pages.
- [`page.tsx`](../../../../../web/app/page.tsx) — homepage.
- [`not-found.tsx`](../../../../../web/app/not-found.tsx), [`forbidden.tsx`](../../../../../web/app/forbidden.tsx), [`unauthorized.tsx`](../../../../../web/app/unauthorized.tsx) — Next.js error boundaries.
- [`robots.ts`](../../../../../web/app/robots.ts), [`manifest.ts`](../../../../../web/app/manifest.ts) — SEO/social metadata. OG/Twitter share-card images are a signed `/og/` route rendered by the image-resize lambda; see [`../lib/seo/og-image-url.ts`](../../../../../web/lib/seo/og-image-url.ts).
- [`globals.css`](../../../../../web/app/globals.css) — Tailwind + plugin registrations.

## Related

- Web rules: [`../AGENTS.md`](../../../../../web/AGENTS.md)
- Component requirements: [`../../docs/requirements/navigation/COMPONENTS.md`](../../../../requirements/navigation/COMPONENTS.md)
- Aside inventory: [`../../docs/requirements/navigation/ASIDES.md`](../../../../requirements/navigation/ASIDES.md)
