# Data Points Specification reference

[Back to Data Points Specification](data-points-spec.md)

## Overview

Data points are structured, typed records that users submit alongside posts. Unlike free-text reviews, data points have defined schemas per vertical that enable aggregation, comparison, and trend analysis.

## Implementation

Typed facts are stored one-to-one in `post_data_point_facts`, keyed by the data-point post.
`posts.data_point_vertical` is the discriminator and must match `post_data_point_facts.vertical`.
Ordered subject topics stay in `post_data_point_topics` (`post_id`, `topic_id`, `order_index`),
with uniqueness on `(post_id, order_index)`. App-level validation enforces schemas per vertical.
Responses rebuild the same `structured_data` object from those rows; omitted optional keys stay
omitted, and an explicit JSON null is a distinct null presence.

### Response object

Every reconstructed `structured_data` object includes:

```json
{
  "vertical": "credit_card",
  "schema_version": 1,
  "topic_ids": ["<uuid of a related card/bank account topic>"],
  "currency": "usd",
  "...": "...vertical-specific fields"
}
```

- `vertical` must match `data_point_vertical` on the post row.
- `schema_version` is `1` for all current schemas. Future schema changes increment this value.
- `topic_ids` contains the related card or bank account topic UUIDs in `order_index` order.
- `currency` is the record-wide lowercase currency code. Every nested money value and range must
  use it.

### Principles

- **Extensible**: New verticals add new schemas without modifying the core data model. Register in `backend/services/data-points/verticals.mts`.
- **Typed**: Every field has a defined type for consistent aggregation.
- **Versionable**: `schema_version` is a typed fact column so a future schema can add columns without a JSON decoder.
- **Aggregatable**: Field types are chosen to support meaningful rollups (averages, distributions, rates).
- **Indexed**: `post_data_point_facts.result`, present `credit_score_range`, and `post_data_point_topics (topic_id)` support search and insights.

## Profile Pre-Fill & Save-To-Profile

When creating a data point, profile-sourced fields (credit score, income, total credit limit, years of credit history, hard inquiries, cards opened) are pre-filled from the user's saved financial profile (`individual_financial_profiles`). The user can override any of these values for the specific submission.

An opt-in **"Save changes to my profile"** checkbox (unchecked by default) appears in the Profile section. When checked and the post is submitted, the profile-sourced fields from that submission are written back to `individual_financial_profiles` via `PUT /api/v1/my/financial-profile`. This is best-effort: a profile-save failure shows a non-fatal toast but does not roll back the post.

### Profile-Sourced vs. Per-Application Fields

| Section              | Fields                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Your Profile**     | Credit score range, stated income range, total credit limit (all cards), years of credit history, hard inquiries 12m, cards opened 24m     |
| **This Application** | Card (topic), result, existing relationship with issuer, approved credit limit, business application, application method, application date |

The "existing relationship with issuer" field is intentionally per-application (not profile-scoped) because it reflects whether the applicant had a prior relationship with a specific issuer at the time of that specific application.

## Privacy & Anonymity

**Data points are public by design** to enable aggregation and trend analysis. Financial fields in data points (e.g., `credit_score_range`, `stated_income_range`) are pre-filled from a user's private financial profile but become part of the public post once submitted.

Users can post data points anonymously via the `is_anonymous` flag to contribute to public aggregations while decoupling their data from their public identity. Anonymous posts hide the author identity from other users, showing only "anonymous" alongside the post timestamp, while creators and administrators retain access to the author metadata.

Aggregation thresholds (minimum N = 10–20 samples per aggregate, depending on the vertical) reduce re-identification risk by ensuring no single user's data dominates a statistic. Small samples display "Not enough data yet" rather than statistics that could reveal individual responses.

### Indexes

```sql
-- Vertical filter index
idx_posts__data_point_vertical (data_point_vertical, id DESC) WHERE data_point_vertical IS NOT NULL AND deleted_at IS NULL

-- Topic membership, including display order
post_data_point_topics PRIMARY KEY (post_id, topic_id)
uq_post_data_point_topics__post_id__order_index UNIQUE (post_id, order_index)
idx_post_data_point_topics__topic_id (topic_id) INCLUDE (post_id)

-- Fact filters
idx_post_data_point_facts__result (result)
idx_post_data_point_facts__credit_score_range (credit_score_range) WHERE credit_score_range_presence = 'present'
```

### Adding a New Vertical

1. Add the vertical value to `DataPointVertical` type in `backend/types/entities/data-point.mts`
2. Add result and field types to `data-point.mts`
3. Add result options, field value constants, and allowed values to `ts-shared/data-points/schemas.mts` (single source of truth shared by frontend and backend)
4. Add validation logic to `backend/services/data-points/validate.mts`
5. Add the topic_type to `backend/types/entities/topic.mts` if it maps to a new topic type
6. Add a migration for the new topic_type if needed
7. Add form fields component in `web/components/posts/data-point-fields.tsx`
8. Add display component in `web/components/posts/data-point-detail.tsx`
