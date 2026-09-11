# Signed-out User Action Buttons

This document is the authoritative policy for which action buttons are visible to signed-out (anonymous) users and what happens when they interact with them.

Code entry points: [web/components/shared/follow-button.tsx](../../../web/components/shared/follow-button.tsx) · [web/components/votes/score-vote.tsx](../../../web/components/votes/score-vote.tsx) · [web/lib/permissions/can-see-downvotes.ts](../../../web/lib/permissions/can-see-downvotes.ts) · [web/components/shared/hide-button.tsx](../../../web/components/shared/hide-button.tsx) · [web/components/news/news-item-actions.tsx](../../../web/components/news/news-item-actions.tsx)

See also: [web/CLAUDE.md](../../../web/CLAUDE.md) · [docs/requirements/security/AUTH.md](../security/AUTH.md) · [Entity × Action Matrix](../ENTITY-ACTION-MATRIX.md)

## Policy

**Vote and follow buttons are always visible** — they serve as signup CTAs. Clicking them when signed out navigates to `/login?next=<current-path>&intent=<action>` via a `<Link>` anchor (not `router.push`, not a modal). This matches the no-auth-context pattern in `web/CLAUDE.md` and preserves the user’s return path after login.

**Hide and Save buttons are never rendered for signed-out users** — these are personal feed preferences that are meaningless without an account. Gate at the call site: `{isLoggedIn && <HideButton … />}` and `{isLoggedIn && <SaveButton … />}`.

**`TopicActionsAside` is visible to all users** — the entire aside renders for every visitor (no auth gate). The RSS feed link (`data-pw='topic-rss-feed-aside'`) is always an external RSS link. Mute renders as a login-redirect link (`/login?next=<path>&intent=mute`) when signed out, and as an `EntityBookmarkButton` toggle when signed in. The Contribute section (Write a Review / Share a Data Point / Start a Discussion) is **signed-in only** — gated by `{currentUser && (...)}` because the create pages redirect to `/login` without a `next` parameter, which would lose the `topic_id` context after login. `useAuth()` inside `TopicActionsAside` drives all signed-in vs signed-out rendering; do not pass `isAuthenticated` as a prop — it is read from auth context.

**Block/mute on other surfaces** remain signed-in only (those components are not rendered for signed-out users at their call sites).

**Report button is never rendered for signed-out users** — reporting requires an authenticated identity to prevent anonymous abuse and to enable idempotency. Gate at the call site: `{isLoggedIn && <ReportInlineButton … />}` and guard `ReportMenuItem` with `currentUserId` before rendering the item.

## Action × Entity matrix

| Entity                  | Vote (signed-out)                       | Vote (signed-in)                                                | Follow (signed-out)                        | Follow (signed-in)      | Save (signed-out) | Save (signed-in) | Hide (signed-out) | Hide (signed-in) | Edit / Delete (signed-out)   |
| ----------------------- | --------------------------------------- | --------------------------------------------------------------- | ------------------------------------------ | ----------------------- | ----------------- | ---------------- | ----------------- | ---------------- | ---------------------------- |
| Post                    | Sign In → `/login?next=...&intent=vote` | semantic choices + counts (down count hidden for non-paid/anon) | n/a                                        | n/a                     | **NOT rendered**  | save/unsave      | **NOT rendered**  | hide/unhide      | **NOT rendered** (auth-only) |
| Comment                 | Sign In → `/login?next=...&intent=vote` | semantic choices + counts (down count hidden for non-paid/anon) | n/a                                        | n/a                     | **NOT rendered**  | save/unsave      | n/a               | n/a              | **NOT rendered** (auth-only) |
| Topic                   | Sign In → `/login?next=...&intent=vote` | semantic choices + counts                                       | "Follow" → `/login?next=...&intent=follow` | Follow/Following toggle | n/a               | n/a              | n/a               | n/a              | n/a                          |
| User                    | n/a _(user tags are signed-in only)_    | n/a                                                             | "Follow" → `/login?next=...&intent=follow` | Follow/Following toggle | n/a               | n/a              | n/a               | n/a              | n/a                          |
| RSS feed (source topic) | Sign In → `/login?next=...&intent=vote` | semantic choices + counts                                       | "Follow" → `/login?next=...&intent=follow` | Follow/Following toggle | n/a               | n/a              | n/a               | n/a              | n/a                          |
| RSS feed item (news)    | Sign In → `/login?next=...&intent=vote` | semantic choices + counts                                       | n/a _(no follow)_                          | n/a                     | **NOT rendered**  | save/unsave      | **NOT rendered**  | hide/unhide      | n/a                          |
| Domain                  | Sign In → `/login?next=...&intent=vote` | semantic choices + counts                                       | n/a                                        | n/a                     | n/a               | n/a              | n/a               | n/a              | n/a                          |
| Tag (post tag widget)   | Sign In → `/login?next=...&intent=vote` | Confirm/Dispute + counts                                        | n/a                                        | n/a                     | n/a               | n/a              | n/a               | n/a              | n/a                          |

## Implementation patterns

### Vote (`ScoreVote`)

All vote surfaces use a single `ScoreVote` component (`web/components/votes/score-vote.tsx`).

Pass `signedOut={!currentUserId}`. When true, semantic-choice controls render as intent-aware login links built from the current route. Positive counts remain visible to all users; negative-count visibility on UGC is governed by `hideDownCount` (see below).

**Negative-count visibility (UGC only — posts and comments):** Pass `hideDownCount={!canCurrentUserSeeDownvotes(currentUser)}` from `web/lib/permissions/can-see-downvotes.ts`. Paid members and admins see the count; anonymous and free signed-in users do not. The backend also zeroes `votes_count_down` in the API response for non-paid users on posts, so the DOM stays consistent. The aggregate net remains API-visible but is not rendered.

Non-UGC surfaces (topics, sources, hostnames, RSS feed items, tags) do not pass `hideDownCount` and show real counts to all viewers.

`presentation='compact'` is the default semantic chooser with raw positive/negative counts.
`presentation='group'` renders the full five-choice sentiment group. Binary policies render their
two labelled choices with raw counts.

### Follow (`FollowButton`)

Pass `currentUserId={currentUserId}`. When `currentUserId` is absent or null, the button renders as `<Button asChild><Link href='/login?next=...&intent=follow'>Follow</Link></Button>` with a "Sign in to follow" tooltip. When `currentUserId` is present, delegates to `EntityBookmarkButton` as normal.

**Do not gate with `{currentUserId && <FollowButton …>}`.** Pass `currentUserId` directly so the component handles signed-out rendering itself.

### Hide (`HideButton`)

Gate at the **call site**:

```tsx
{isLoggedIn && <HideButton entityType='rss_feed_item' entityId={item.id} initialActive={…} />}
```

The `HideButton` component itself has no `disabled` prop — it assumes a signed-in caller.

### Save (`SaveButton`)

Gate at the **call site**:

```tsx
{isLoggedIn && <SaveButton entityType='rss_feed_item' entityId={item.id} initialActive={…} />}
```

The `SaveButton` component has no `disabled` prop — it assumes a signed-in caller.

## Related

- [Auth](../security/AUTH.md) — manual authentication QA checklist
- [Actions](ACTIONS.md) — action-button placement and tooltip requirements
- [Web rules](../../../web/CLAUDE.md) — signed-out UI and no-auth-context patterns
- [Backend rules](../../../backend/CLAUDE.md) — vote and permission API conventions
