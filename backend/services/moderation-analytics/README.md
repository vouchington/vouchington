# `@services/moderation-analytics`

Aggregates moderation analytics for global admin and community moderator dashboards.

## Scope

- Queue volume from `moderation_reports`, `post_clearance_changes`, and `moderator_actions`.
- Rule violation trends from report reasons.
- Automod performance from agent moderation, OpenAI omni moderation, spam detection, training feedback, and automod moderator actions.
- Moderator workload from `moderator_actions`.
- Appeal outcomes from `moderation_appeals`.
- New-user friction from first posts in the requested scope.

## API

```ts
import { getModerationAnalytics } from '@services/moderation-analytics'

await getModerationAnalytics('30d', { type: 'global' })
await getModerationAnalytics('30d', { type: 'community', communityId })
```

Supported ranges: `today`, `7d`, `30d`, `90d`, `all`.

## Query Notes

UUIDv7-backed tables use UUID lower-bound predicates for selected date ranges. Timestamp-backed tables, including moderation reports and appeal resolution timestamps, use timestamp predicates.
