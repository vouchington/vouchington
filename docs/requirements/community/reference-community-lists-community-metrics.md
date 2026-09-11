# Community Lists reference

[Back to Community Lists](community-lists.md)

## Community Metrics

The `view_community_metrics` view provides aggregate counts per community:

| Field                        | Description                             |
| ---------------------------- | --------------------------------------- |
| `member_count`               | Active (non-removed) community members  |
| `post_count`                 | Published, non-rejected community posts |
| `list_item_count`            | Total items across all 5 list tables    |
| `proxy_follow_count`         | Users who proxy-follow this community   |
| `proxy_mute_count`           | Users who proxy-mute this community     |
| `virtual_subscription_count` | `proxy_follow_count + proxy_mute_count` |

Metrics are returned in `GET /api/v1/communities/:idOrSlug` (always) and unconditionally in `GET /api/v1/communities` regardless of sort or filters. `GET /api/v1/trending-communities` uses the same member, post, and virtual-subscription formulas as set-based aggregates instead of joining this view; see [backend/services/trending-communities/README.md](../../../backend/services/trending-communities/README.md).

## Related

- [Web rules](../../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/CLAUDE.md) — service, API, and data conventions

- Service: [backend/services/communities/list-items/README.md](../../../backend/services/communities/list-items/README.md)
- Metrics service: `backend/services/communities/metrics.mts`
- Trending communities: [backend/services/trending-communities/README.md](../../../backend/services/trending-communities/README.md)
- API routes: `backend/api/v1/communities/list-items-*.mts`
- Community News API: `backend/api/v1/communities/news.mts`
- Community feeds: `web/app/(communities)/communities/[slug]/page.tsx` and `web/app/(communities)/communities/[slug]/news/page.tsx`
- Entity relations: `proxy_follow` and `proxy_mute` predicates on `user → community`
- Explore Lists page: `web/app/(communities)/communities/lists/page.tsx`
- [docs/requirements/navigation/ACCESSIBILITY.md](../navigation/ACCESSIBILITY.md)
- [docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md](../users/ACCOUNT-DELETION-DATA-REQUEST.md)
