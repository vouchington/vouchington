# Web Components

Top-level component taxonomy for [`web/components/`](./). See [../CLAUDE.md](../CLAUDE.md) for agent conventions.

## Subdirectory Map

| Subdirectory                                       | Purpose                                                                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`admin/`](admin/)                                 | Admin-only management views (users, queues, migrations, Valkey)                                                                                   |
| [`asides/`](asides/)                               | Per-page right-sidebar content registered via `PageWithAside`                                                                                     |
| [`auth/`](auth/)                                   | Authentication UI (login, signup, OAuth buttons, TOTP)                                                                                            |
| [`brand/`](brand/)                                 | Voucha brand assets (logo, wordmark, avatar)                                                                                                      |
| [`comments/`](comments/)                           | Comment threads, creation form, moderation actions                                                                                                |
| [`communities/`](communities/)                     | Community pages, member management, community cards                                                                                               |
| [`compare/`](compare/)                             | Side-by-side topic comparison UI                                                                                                                  |
| [`domains/`](domains/)                             | Domain detail pages and hostname cards                                                                                                            |
| [`feed/`](feed/)                                   | Post/RSS feed list and infinite-scroll containers                                                                                                 |
| [`home/`](home/)                                   | Home and landing page components                                                                                                                  |
| [`hostnames/`](hostnames/)                         | Hostname-level crawl status and crawl cards                                                                                                       |
| [`landing-pages/`](landing-pages/)                 | User landing page builder and analytics display                                                                                                   |
| [`layout/`](layout/)                               | `ContentContainer` — 1200px max-width wrapper (note: `PageWithAside`, `AsideColumn`, `AsideDrawer` live at [`web/components/`](.) root, not here) |
| [`memberships/`](memberships/)                     | Plan selection, billing management, Stripe elements                                                                                               |
| [`my/`](my/)                                       | Authenticated user management (profile, wallet, preferences, API keys)                                                                            |
| [`news/`](news/)                                   | News/discussions feed, RSS item modals                                                                                                            |
| [`notifications/`](notifications/)                 | Notification list, push permission prompt                                                                                                         |
| [`posts/`](posts/)                                 | Post cards, creation form, detail view, moderation                                                                                                |
| [`referral-links/`](referral-links/)               | Referral link submission and ranking display                                                                                                      |
| [`rss-feed-items/`](rss-feed-items/)               | RSS item cards and detail modals                                                                                                                  |
| [`seo/`](seo/)                                     | Structured data (JSON-LD), meta tags, canonical URL helpers                                                                                       |
| [`shared/`](shared/)                               | Cross-domain primitives (vote buttons, follow buttons, tag chips)                                                                                 |
| [`social/`](social/)                               | Social sharing buttons, follow/mute/block UI                                                                                                      |
| [`sources/`](sources/)                             | RSS source directory and source detail pages                                                                                                      |
| [`tags/`](tags/)                                   | Tag search, tag chips, topic tagging UI                                                                                                           |
| [`topic-recommendations/`](topic-recommendations/) | Personalized topic recommendation cards                                                                                                           |
| [`topics/`](topics/)                               | Topic pages, topic cards, info panels, comparison input                                                                                           |
| [`ui/`](ui/)                                       | shadcn/ui base components (Button, Dialog, Tabs, etc.)                                                                                            |
| [`urls/`](urls/)                                   | URL cards and URL-level crawl display                                                                                                             |
| [`users/`](users/)                                 | User profile routes, follow lists, user cards                                                                                                     |
| [`votes/`](votes/)                                 | Vote buttons, vote-count displays, election UI                                                                                                    |

## Key Layout Components

- **[`layout/content-container.tsx`](layout/content-container.tsx)** — `mx-auto w-full max-w-[1200px]` wrapper shared by navbar, aside sticky bar, and footer. Never hand-code this pattern.
- **`aside-column.tsx`** / **`aside-drawer.tsx`** — right-sidebar visibility primitives. Pass content via the `aside` prop on `PageWithAside`.
- **[`ui/sidebar.ts`](ui/sidebar.ts)** — left navigation sidebar (`collapsible='offcanvas'`).

## Related

- Web agent rules: [../CLAUDE.md](../CLAUDE.md)
- Layout and responsive rules: [Mobile Responsiveness](../../docs/requirements/navigation/MOBILE.md)
- Aside inventory: [../../docs/requirements/navigation/ASIDES.md](../../docs/requirements/navigation/ASIDES.md)
- UI component patterns: [../../docs/requirements/navigation/COMPONENTS.md](../../docs/requirements/navigation/COMPONENTS.md)
