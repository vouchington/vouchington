# Sidebar reference

[Back to Sidebar](SIDEBAR.md)

## Section Ordering

Sections are ordered to match the user journey: discover → engage → contribute → share.

**Explore → Communities → Share → Topics → Trust → Help → Growth → CMS → Engineering**

- **Explore** — universal discovery, always visible; authenticated users see News Feed and Posts Feed at the top. News is visible to all users in the News intent Browse group (`/news`).
- **Share** — creation tools (authenticated only)
- **Topics / Trust** — reference and taxonomy; lower-frequency navigation targets
- **Growth** — analytics for administrators and investors
- **CMS** — content, moderation analytics, and agent management for administrators (URLs, Agents, Topics)
- **Engineering** — infrastructure operations for administrators, plus Dynamic Config for its
  viewer roles (administrators, moderators, developers, customer support, and investors)

## Link Stability Rule

Sidebar link `href` values must not change between user types. A label that appears for multiple auth states (signed-out, signed-in, admin) must always point to the same URL. Use show/hide to gate links by auth state — never re-route the same label to a different destination.

**Correct**: Hide "News Feed" for signed-out users; show it at `/feed/news` for signed-in users.

**Wrong**: Show "News" at `/news` for signed-out users and at `/feed/news` for signed-in users.

This ensures predictable navigation behavior regardless of auth state and avoids confusion when users log in/out.

## Items Removed from Sidebar (Still Accessible)

These pages remain accessible via their URLs and through the `/topics` page filters:

- `/cards`
- `/spending-categories`
- `/rewards-programs`
- `/rewards-program-statuses`
- `/posts` (All Posts)

## Related

- [Navigation](NAVIGATION.md) — Intent/Group/Item vocabulary this sidebar renders
- [Web rules](../../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/CLAUDE.md) — service, API, and data conventions

- [docs/requirements/navigation/ACCESSIBILITY.md](./ACCESSIBILITY.md)
- [docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md](../users/ACCOUNT-DELETION-DATA-REQUEST.md)
- [Admin Navigation Matrix](../ADMIN-NAVIGATION-MATRIX.md) — admin entity pages, actions, and navigation paths
