# Data Points Specification reference

[Back to Data Points Specification](data-points-spec.md)

## Overview

Data points are structured, typed records that users submit alongside posts. Unlike free-text reviews, data points have defined schemas per vertical that enable aggregation, comparison, and trend analysis.

## Implementation

Structured data is stored in the `structured_data JSONB` column on the `posts` table, alongside a `data_point_vertical TEXT` discriminator column for efficient filtering. App-level validation enforces schemas per vertical.

### JSONB Schema

Every `structured_data` object includes:

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
- `topic_ids` contains the related card or bank account topic UUIDs.
- `currency` is the record-wide lowercase currency code. Every nested money value and range must
  use it.

### Principles

- **Extensible**: New verticals add new schemas without modifying the core data model. Register in `backend/services/data-points/verticals.mts`.
- **Typed**: Every field has a defined type for consistent aggregation.
- **Versionable**: `schema_version` inside the JSONB allows future schema evolution without migrations.
- **Aggregatable**: Field types are chosen to support meaningful rollups (averages, distributions, rates).
- **Indexed**: GIN index on `structured_data`, plus expression indexes on `topic_id` and `result` for fast queries.

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
-- GIN index for arbitrary JSONB queries
idx_posts__structured_data (structured_data jsonb_path_ops) WHERE structured_data IS NOT NULL AND deleted_at IS NULL

-- Vertical filter index
idx_posts__data_point_vertical (data_point_vertical, id DESC) WHERE data_point_vertical IS NOT NULL AND deleted_at IS NULL

-- Topic filter index (for per-card/account aggregations)
idx_posts__structured_data__topic_id (structured_data->>'topic_id') WHERE structured_data IS NOT NULL AND deleted_at IS NULL

-- Result filter index
idx_posts__structured_data__result (structured_data->>'result') WHERE structured_data IS NOT NULL AND deleted_at IS NULL
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
