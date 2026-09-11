# Action Buttons reference

[Back to Action Buttons](ACTIONS.md)

## Component Reference

### Primitive: `EntityBookmarkButton`

`web/components/shared/entity-bookmark-button.tsx`

Universal toggle button for all bookmark-based actions. Accepts `entityType`, `entityId`, `predicate`, labels, `initialActive`, optional `tooltip` / `loadingTooltip`, and presets for standard subscribe, mute, and block actions. Handles optimistic updates, error rollback, rate limit toasts, and tooltip rendering.

### Common Bookmark Configurations

| Action    | Predicate                                             | Labels                                       |
| --------- | ----------------------------------------------------- | -------------------------------------------- |
| Follow    | `follow`                                              | `Follow` / `Following` via `FollowButton`    |
| Mute      | `preset='mute'`                                       | `Mute` / `Muted`                             |
| Block     | `preset='block'`                                      | `Block` / `Blocked`                          |
| Subscribe | `preset='subscribe'` with optional predicate override | Surface-specific subscribe/subscribed labels |

`FollowButton` remains a small auth-aware wrapper so signed-out viewers receive a `/login` link. Subscribe, mute, and block surfaces configure `EntityBookmarkButton` directly. When `tooltip` is provided, `EntityBookmarkButton` wraps the button in `Tooltip > TooltipTrigger/TooltipContent`.

### Vote Components

| Component                | Use case                                                      | File                                                 |
| ------------------------ | ------------------------------------------------------------- | ---------------------------------------------------- |
| `ScoreVote`              | Adaptive semantic choice control and counts-only presentation | `web/components/votes/score-vote.tsx`                |
| `EntityVouchDisavowVote` | Compact entity-trust presentation using the semantic contract | `web/components/votes/entity-vouch-disavow-vote.tsx` |

Sentiment elections expose Vouch (+2), Like (+1), Neutral (0), Dislike (-1), and Disavow (-2).
Recommendation, relation, and moderation surfaces use their narrower semantic policies. Clear is
a separate DELETE action, not the Neutral choice. Vote displays show counts rather than a rendered
net score; the aggregate net remains API-visible.

### Vote State Hook: `useElectionVote`

`web/lib/votes/use-election-vote.ts`

Manages optimistic semantic vote state for `ScoreVote`. It reconciles sign-based count buckets for
same-sign changes, cross-sign changes, Neutral, and Clear, then rolls back failed mutations.
