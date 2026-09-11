# Data Points Service

Validates structured data for data point posts. Owns the registry of allowed verticals, field
values, and schema validation logic.

## Purpose

The `data_point` post type stores structured data in the `structured_data JSONB` column on posts.
This service validates that the data conforms to the correct schema for the given vertical.

## Supported Verticals

- `credit_card` — credit card application data points
- `bank_account` — bank account application data points

## Files

| File            | Description                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `types.mts`     | Re-exports canonical types from `@voucha/types/entities/data-point`                                                       |
| `verticals.mts` | Validates whether a given string is a supported vertical name (delegates allowed value lists to `@ts-shared/data-points`) |
| `validate.mts`  | `assertValidStructuredData(vertical, data)` — throws 422 on invalid data                                                  |
| `search.mts`    | `searchDataPoints(options)` — filter data points by topic, vertical, result, or credit score range                        |
| `insights.mts`  | `getTopicDataPointInsights(topicId, options?)` — aggregate stats for a topic                                              |
| `index.mts`     | Barrel exports                                                                                                            |

## Usage

```typescript
import { assertValidStructuredData } from '@services/data-points'

// In post creation:
if (postType === 'data_point' && structured_data !== undefined) {
  assertValidStructuredData(data_point_vertical, structured_data)
}
```

### Searching data points

```typescript
import { searchDataPoints } from '@services/data-points/search'

const results = await searchDataPoints({
  topic_id: 'uuid', // filter by topic
  vertical: 'credit_card', // filter by vertical
  result: 'approved', // 'approved' | 'denied' | 'pending'
  credit_score_range: '670-739',
  limit: 25, // max 25
})
```

### Topic-level insights

```typescript
import { getTopicDataPointInsights } from '@services/data-points/insights'

const insights = await getTopicDataPointInsights('topic-uuid', { vertical: 'credit_card' })
// Returns: { total_count, approved_count, denied_count, pending_count,
//            approval_rate, median_credit_limits, credit_score_distribution }
```

`approval_rate` is `null` when `total_count === 0`. `median_credit_limits` is a `Money[]`, with one
entry per currency and `[]` when no data points have a credit limit recorded. It uses the lower
observed value for an even sample so every valid JSON-safe `Money` amount remains exactly
representable. Different currencies are never aggregated. `credit_score_distribution` is a
`Record<string, number>` mapping score range labels to counts.

## Adding a New Vertical

1. Add the vertical to `DataPointVertical` in [`backend/types/entities/data-point.mts`](../../types/entities/data-point.mts)
2. Define result/field types in `data-point.mts`
3. Add allowed values to `verticals.mts`
4. Add validation branch in `validate.mts`
5. Wire up topic type in [`backend/types/entities/topic.mts`](../../types/entities/topic.mts)
6. Add migration if a new topic_type is needed
7. Add form + detail display components in [`web/components/posts/`](../../../web/components/posts/)

## JSONB Schema

Every `structured_data` object requires:

```json
{
  "vertical": "<vertical name>",
  "schema_version": 1,
  "topic_id": "<uuid>",
  "...": "...vertical-specific fields"
}
```

See [docs/requirements/platform/data-points-spec.md](../../../docs/requirements/platform/data-points-spec.md) for full field reference.

## Related

- [Data Points Spec](../../../docs/requirements/platform/data-points-spec.md)
- [Currency-aware integer money contract](../../../docs/overview/architecture/monetary-values.md)
- [User Financial Profiles Service](../user-financial-profiles/README.md)
- [Posts Service](../posts/README.md)
