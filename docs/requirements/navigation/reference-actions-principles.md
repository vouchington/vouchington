# Action Buttons reference

[Back to Action Buttons](ACTIONS.md)

## Principles

### Hero vs Aside Placement

**Hero (in the entity header):** Primary engagement actions visible to all authenticated users.

- **Follow** — subscribe to an entity's feed
- **Vouch / Disavow** — signal quality or recommendation

**Aside (right sidebar):** Moderation, management, and subscription actions, visible only to the current user.

- **Subscribe\*** — notify me of new posts/news from this entity (always aside, never hero or list)
- **Mute** — hide an entity from your feed
- **Block** — block a user from interacting with you
- **User tag vote** — vouch for or disavow a curated community label on a user

**Inline in entity cards (lists/search):** Convenience actions to avoid navigating to detail page.

- Follow, Mute on topic cards (authenticated users only)

### Tooltips Are Required

Every action button must have a tooltip. New users do not know what buttons mean. Tooltips must:

- Be concise (10 words or fewer)
- Explain what happens when clicked (not just re-state the label)
- Appear on hover immediately (root layout provides `TooltipProvider delayDuration={0}`)

### No N+1 Fetches in Lists

When action buttons appear in list views (`.map()` callbacks), the initial state must be passed from a batch response. Never let buttons lazy-fetch their own status. Automated replacement coverage for this policy is tracked in the static-analysis migration milestone.

Required props: `FollowButton → isFollowing`, `EntityBookmarkButton → initialActive`.
