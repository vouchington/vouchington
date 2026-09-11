# UI Components reference

[Back to UI Components](COMPONENTS.md)

## Canonical Entity List-Item Components

**Rule:** Every entity type has exactly one canonical list-item / card component. All list surfaces — public discovery pages, `/my/*` pages, public-profile tabs, asides, and dropdowns — must render through that component. No surface may re-implement the entity row inline.

### Canonical component registry

| Entity type                                 | Canonical component                                     | File                                                   |
| ------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------ |
| `rss_feed` (article/video)                  | `RssFeedListItem` → `ArticleListItem` / `VideoListItem` | `web/components/sources/rss-feed-list-item.tsx`        |
| `rss_feed` (podcast)                        | `RssFeedListItem` → `PodcastListItem`                   | `web/components/podcasts/podcast-list-item.tsx`        |
| `user`                                      | `UserList`                                              | `web/components/users/user-list.tsx`                   |
| `community`                                 | `CommunityCard`                                         | `web/components/communities/community-card.tsx`        |
| `hostname` / domain                         | `HostnameListItem`                                      | `web/components/domains/hostname-list-item.tsx`        |
| `referral_link` (`PrioritizedReferralLink`) | `ReferralLinkCard`                                      | `web/components/referral-links/referral-link-card.tsx` |
| `notification`                              | `NotificationRow`                                       | `web/components/notifications/notification-row.tsx`    |
| `post`                                      | `PostCard`                                              | `web/components/posts/post-card.tsx`                   |
| `rss_feed_item`                             | `NewsItemCard`                                          | `web/components/feed/news-item-card.tsx`               |
| `list_item`                                 | `ListItemRow`                                           | `web/components/lists/list-item-row.tsx`               |

### Allowed exceptions (do NOT merge these)

- **Role-gated dual variants:** appeal (`AppealRow` / `MemberAppealRow`) and dispute (`DisputeRow` / `MemberDisputeRow`) rows are deliberately selected by `viewerTier` in a single table component. Keep them separate.
- **Compact atoms:** single-line atoms used in command-palette / autocomplete results (`UserLink`, `UserAutocomplete`, cmd+K result rows) are legitimate because they render substantially less information and serve a distinct interaction surface.
- **Multi-projection entities:** `referral_link` has three distinct API projections (`PrioritizedReferralLink` → `ReferralLinkCard`; `ReferralLinkFeedItem` → `ReferralLinkFeedCard`; editable `/my` management row). These are genuinely different data shapes, not duplicates. Keep all three.
- **Compose-not-duplicate:** sidebar/aside components that _compose_ the canonical card (e.g. `TopicCommunitiesAsideContent` wrapping a list of community names with the canonical link helper) are fine.
- **Comparison metric cards:** `/domains/compare` renders side-by-side domain score summaries, not standard domain rows. Keep that page's comparison-specific cards separate unless `HostnameListItem` gains a comparison variant.
- **Community management surfaces:** `CommunityMemberRow` and `CommunityListItemCard` render management-specific membership/list controls, not public discovery rows. Keep them separate unless `CommunityCard` gains matching management variants.

### Enforcement

- When adding a new page or list surface that renders an entity from the registry above, import the canonical component — never build a new inline row.
- Aside and dropdown surfaces that show a subset of the entity's information should either use the canonical component with a `compact` / `variant` prop, or explicitly document the exception in this table.
- New entity types should register their canonical component in this table when they first appear in a list surface.
- The `web-no-inline-entity-row` ast-grep rule flags `.tsx` JSX that pairs an entity link helper (`userHref`, `communityHref`, `feedHref`, `domainHref`, `tagHref`, `postHref`) with a card/row container (`<Card>`, `<HoverableCard>`, `<article>`, `<tr>`, `<TableRow>`, or referral-link `data-pw`/class patterns). If a new surface is intentionally not canonical, document the exception here first, then either add the file path to the `ignores:` list in `ast-grep-rules/web-no-inline-entity-row.yml` or add an inline `// ast-grep-ignore: web-no-inline-entity-row -- <reason>` above the offending JSX.

### Relation/management list pages

`Users*RelationList` pages (`/my/*`, `/user/<id>/*`) display a canonical card **plus** a single `RelationManagementAction` (unblock/unmute/unsubscribe button). The canonical card must be rendered in passive mode (`hideBookmarkActions`) so it exposes no built-in bookmark controls — the `RelationManagementAction` sibling is the only bookmark control per item. Never double-render bookmark controls on a relation list item.

Passive mode is implemented by the card's `hideBookmarkActions` prop:

- `TopicCard`: suppresses `FollowButton` + mute `EntityBookmarkButton` (keeps `ScoreVote` if supplied)
- `PostCard`: suppresses `FollowerShareActions` + `SaveButton` + `HideButton` (keeps vote/comment/author/time/report)

List components that correctly use passive mode: `UserTopicList`, `UserPostRelationList`.
List components whose canonical card is already passive (no built-in bookmark actions): `UserUrlRelationList`, `UserHostnameRelationList`.
