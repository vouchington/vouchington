# Web Components

Source entrypoint: [web/components/README.md](../../../../../web/components/README.md)

Top-level component taxonomy for [`web/components/`](../../../../../web/components/). See [../AGENTS.md](../../../../../web/AGENTS.md) for agent conventions.

## Subdirectory Map

| Subdirectory                                                                     | Purpose                                                                                                                                                                       |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`admin/`](../../../../../web/components/admin/)                                 | Admin-only management views (users, queues, migrations, Valkey)                                                                                                               |
| [`asides/`](../../../../../web/components/asides/)                               | Per-page right-sidebar content registered via `PageWithAside`                                                                                                                 |
| [`auth/`](../../../../../web/components/auth/)                                   | Authentication UI (login, signup, OAuth buttons, TOTP)                                                                                                                        |
| [`brand/`](../../../../../web/components/brand/)                                 | Voucha brand assets (logo, wordmark, avatar)                                                                                                                                  |
| [`comments/`](../../../../../web/components/comments/)                           | Comment threads, creation form, moderation actions                                                                                                                            |
| [`communities/`](../../../../../web/components/communities/)                     | Community pages, member management, community cards                                                                                                                           |
| [`compare/`](../../../../../web/components/compare/)                             | Side-by-side topic comparison UI                                                                                                                                              |
| [`domains/`](../../../../../web/components/domains/)                             | Domain detail pages and hostname cards                                                                                                                                        |
| [`feed/`](../../../../../web/components/feed/)                                   | Post/RSS feed list and infinite-scroll containers                                                                                                                             |
| [`home/`](../../../../../web/components/home/)                                   | Home and landing page components                                                                                                                                              |
| [`hostnames/`](../../../../../web/components/hostnames/)                         | Hostname-level crawl status and crawl cards                                                                                                                                   |
| [`landing-pages/`](../../../../../web/components/landing-pages/)                 | User landing page builder and analytics display                                                                                                                               |
| [`layout/`](../../../../../web/components/layout/)                               | `ContentContainer` — 1200px max-width wrapper (note: `PageWithAside`, `AsideColumn`, `AsideDrawer` live at [`web/components/`](../../../../../web/components) root, not here) |
| [`memberships/`](../../../../../web/components/memberships/)                     | Plan selection, billing management, Stripe elements                                                                                                                           |
| [`my/`](../../../../../web/components/my/)                                       | Authenticated user management (profile, wallet, preferences, API keys)                                                                                                        |
| [`news/`](../../../../../web/components/news/)                                   | News/discussions feed, RSS item modals                                                                                                                                        |
| [`notifications/`](../../../../../web/components/notifications/)                 | Notification list, push permission prompt                                                                                                                                     |
| [`posts/`](../../../../../web/components/posts/)                                 | Post cards, creation form, detail view, moderation                                                                                                                            |
| [`referral-links/`](../../../../../web/components/referral-links/)               | Referral link submission and ranking display                                                                                                                                  |
| [`rss-feed-items/`](../../../../../web/components/rss-feed-items/)               | RSS item cards and detail modals                                                                                                                                              |
| [`seo/`](../../../../../web/components/seo/)                                     | Structured data (JSON-LD), meta tags, canonical URL helpers                                                                                                                   |
| [`shared/`](../../../../../web/components/shared/)                               | Cross-domain primitives (vote buttons, follow buttons, tag chips)                                                                                                             |
| [`social/`](../../../../../web/components/social/)                               | Social sharing buttons, follow/mute/block UI                                                                                                                                  |
| [`sources/`](../../../../../web/components/sources/)                             | RSS source directory and source detail pages                                                                                                                                  |
| [`tags/`](../../../../../web/components/tags/)                                   | Tag search, tag chips, topic tagging UI                                                                                                                                       |
| [`topic-recommendations/`](../../../../../web/components/topic-recommendations/) | Personalized topic recommendation cards                                                                                                                                       |
| [`topics/`](../../../../../web/components/topics/)                               | Topic pages, topic cards, info panels, comparison input                                                                                                                       |
| [`ui/`](../../../../../web/components/ui/)                                       | shadcn/ui base components (Button, Dialog, Tabs, etc.)                                                                                                                        |
| [`urls/`](../../../../../web/components/urls/)                                   | URL cards and URL-level crawl display                                                                                                                                         |
| [`users/`](../../../../../web/components/users/)                                 | User profile routes, follow lists, user cards                                                                                                                                 |
| [`votes/`](../../../../../web/components/votes/)                                 | Vote buttons, vote-count displays, election UI                                                                                                                                |

## Key Layout Components

- **[`layout/content-container.tsx`](../../../../../web/components/layout/content-container.tsx)** — `mx-auto w-full max-w-[1200px]` wrapper shared by navbar, aside sticky bar, and footer. Never hand-code this pattern.
- **`aside-column.tsx`** / **`aside-drawer.tsx`** — right-sidebar visibility primitives. Pass content via the `aside` prop on `PageWithAside`.
- **[`ui/sidebar.ts`](../../../../../web/components/ui/sidebar.ts)** — left navigation sidebar (`collapsible='offcanvas'`).

## Related

- Web agent rules: [../AGENTS.md](../../../../../web/AGENTS.md)
- Layout and responsive rules: [Mobile Responsiveness](../../../../requirements/navigation/MOBILE.md)
- Aside inventory: [../../docs/requirements/navigation/ASIDES.md](../../../../requirements/navigation/ASIDES.md)
- UI component patterns: [../../docs/requirements/navigation/COMPONENTS.md](../../../../requirements/navigation/COMPONENTS.md)
