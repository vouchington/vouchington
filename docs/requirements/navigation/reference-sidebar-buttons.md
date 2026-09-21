# Sidebar reference

[Back to Sidebar](SIDEBAR.md)

## Buttons

- Toggle - toggle sidebar on and off
- Chat - start a new chat
- Create - create a post

## Keyboard Shortcut

- `Ctrl+/` (Windows/Linux) or `⌘/` (Mac) toggles the sidebar open/closed.
- A shortcut badge is displayed at the top of the sidebar, inside a toggle button, similar to how the search button in the navbar shows `⌘K` / `Ctrl+K`.
- The badge shows the platform-appropriate modifier key (detected via `navigator.userAgent`).

## Animation

- The sidebar collapses via a **slide-left clip** — not a fade. The outer wrapper (`transition-[width] duration-300 ease-in-out`) shrinks from `--sidebar-width` (16 rem) to `0`, while `overflow-hidden` clips the inner content. The inner content stays at full width and full opacity, transitions `translate`, and moves from `translate-x-0` to the side-aware offcanvas translation (`-translate-x-full` for the left sidebar, `translate-x-full` for the right sidebar), so content slides horizontally while the container collapses.
- **No opacity transition on the inner content** — removing `group-data-[state=collapsed]:opacity-0` from the inner div (line ~243 of `web/components/ui/sidebar.tsx`) is intentional. Adding it back would cause a fade instead of a slide.
- This pattern mirrors `AsideColumn` (`web/components/aside-column.tsx`) which also clips content via `overflow-clip` as its width animates to 0 and translates the fixed-width inner content.
- When `prefers-reduced-motion: reduce` is active, all transition durations are reduced to 1 ms (handled globally in `globals.css`), making open/close effectively instant.

## Behavior

All sections are collapsible accordions (default open). Click the section label to collapse or expand it.

Active, hover, and focus styles on sidebar links must be dimension-stable. Do not change font
weight, padding, border width, row width, or any other box metric when a link is activated; use
color, background, or inset ring/shadow treatments instead.

## Visibility Matrix

| Section                          | Link                                                     | Route                         | Unauth | Auth | Admin | Investor |
| -------------------------------- | -------------------------------------------------------- | ----------------------------- | ------ | ---- | ----- | -------- |
| **Explore**                      | News Feed                                                | `/feed/news`                  | —      | yes  | yes   | yes      |
|                                  | Posts Feed                                               | `/feed/posts`                 | —      | yes  | yes   | yes      |
|                                  | News                                                     | `/news`                       | yes    | yes  | yes   | yes      |
|                                  | Discussions                                              | `/discussions`                | yes    | yes  | yes   | yes      |
|                                  | Reviews                                                  | `/reviews`                    | yes    | yes  | yes   | yes      |
|                                  | Data Points                                              | `/data-points`                | yes    | yes  | yes   | yes      |
|                                  | Communities                                              | `/communities`                | yes    | yes  | yes   | yes      |
| **Share**                        | Landing Pages                                            | `/my/landing-pages`           | —      | yes  | yes   | yes      |
|                                  | Referrals                                                | `/my/referrals`               | —      | yes  | yes   | yes      |
| **Topics**                       | All Topics                                               | `/topics`                     | yes    | yes  | yes   | yes      |
|                                  | Sources                                                  | `/sources`                    | yes    | yes  | yes   | yes      |
|                                  | Referral Programs                                        | `/referral-programs`          | yes    | yes  | yes   | yes      |
| **Trust**                        | Domains                                                  | `/domains`                    | yes    | yes  | yes   | yes      |
| **Help**                         | Support                                                  | `/chat/support`               | —      | yes  | yes   | yes      |
| **Growth**                       | Growth                                                   | `/growth`                     | —      | —    | yes   | yes      |
| **Users & Friends**              | Users                                                    | `/users`                      | —      | yes  | yes   | yes      |
|                                  | Find Friends                                             | `/my/friend-recommendations`  | —      | yes  | yes   | yes      |
| **CMS**                          | URLs                                                     | `/urls`                       | —      | —    | yes   | —        |
|                                  | Review Queue                                             | `/posts/review-queue`         | —      | —    | yes   | —        |
|                                  | Moderation Analytics                                     | `/admin/moderation-analytics` | —      | —    | yes   | —        |
|                                  | Recommend New Topics (page: "New Topic Recommendations") | `/topic-recommendations`      | —      | yes  | yes   | yes      |
|                                  | Create Topic                                             | `/topics/create`              | —      | —    | yes   | —        |
|                                  | Topic Aliases                                            | `/topics/aliases`             | —      | —    | yes   | —        |
|                                  | RSS Feed Categories                                      | `/rss-feed-categories`        | —      | —    | yes   | —        |
|                                  | Curated Asides                                           | `/curated-asides/topics`      | —      | —    | yes   | —        |
| **CRM**                          | CRM                                                      | `/crm`                        | —      | —    | yes   | —        |
|                                  | Memberships                                              | `/memberships/grants`         | —      | —    | yes   | —        |
|                                  | Support                                                  | `/support`                    | —      | —    | yes   | —        |
|                                  | Support Contacts                                         | `/support/contacts`           | —      | —    | yes   | —        |
| **Engineering / Operations**     | Queues                                                   | `/admin/queues`               | —      | —    | yes   | —        |
|                                  | PostgreSQL                                               | `/admin/postgresql`           | —      | —    | yes   | —        |
|                                  | Valkey                                                   | `/admin/valkey`               | —      | —    | yes   | —        |
| **Engineering / Dynamic Config** | Dynamic Config                                           | `/admin/dynamic-config`       | —      | —‡   | yes   | yes      |
|                                  | Vote Integrity                                           | `/vote-integrity/flags`       | —      | —    | yes   | —        |

‡ Dynamic Config is role-gated, not available to every authenticated user. Administrators,
moderators, developers, customer support, and investors can view it. Each namespace's authoritative
`can_update` value controls writes; `feature-flags` specifically grants writes and local overrides
to administrators and developers.
