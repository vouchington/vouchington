# Fediverse Instance Anatomy reference

[Back to Fediverse Instance Anatomy](fediverse-instance.md)

## Data Model

A fediverse instance is a topic with `topic_type = 'fediverse_instance'` plus a 1:1 extension row
in `topics__fediverse_instances`. It mirrors the existing `rss_feed`/[source](./source.md) pattern:
`topic_type` + extension table, voted the same way a source is.

**`topics` row (shared with all topic types):**

| Field         | Notes                                                            |
| ------------- | ---------------------------------------------------------------- |
| `id`          | UUID                                                             |
| `name`        | Raw stored value; never shown directly — use display-name helper |
| `slug`        | URL-safe slug; URL construction uses the helper                  |
| `topic_type`  | Always `fediverse_instance`                                      |
| `hostname_id` | FK to the `url_hostnames` row for the instance's hostname        |

**`topics__fediverse_instances` extension row:**

| Field                       | Notes                                                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `topic_id`                  | FK back to `topics.id` (PK, 1:1)                                                                                                 |
| `software`                  | NodeInfo `software.name` (e.g. `mastodon`, `lemmy`, `peertube`). `NULL` until classified.                                        |
| `protocol`                  | Primary federation protocol reported by NodeInfo (e.g. `activitypub`). `NULL` until classified.                                  |
| `nodeinfo_software_version` | NodeInfo `software.version` string. `NULL` until classified.                                                                     |
| `total_users`               | NodeInfo `usage.users.total`. `NULL` until classified or unreported.                                                             |
| `monthly_active_users`      | NodeInfo `usage.users.activeMonth`. `NULL` until classified or unreported.                                                       |
| `open_registrations`        | NodeInfo `openRegistrations` flag. `NULL` until classified.                                                                      |
| `nodeinfo_raw`              | Full NodeInfo 2.0 document as fetched, for fields not individually modeled.                                                      |
| `integration_status`        | `pending` \| `approved` \| `blocked`. Trigger-maintained from `fediverse_instance_integration_changes` — never written directly. |

**`fediverse_instance_integration_changes`** (append-only admin-decision history):

| Field                | Notes                                                                 |
| -------------------- | --------------------------------------------------------------------- |
| `id`                 | UUIDv7, ordered                                                       |
| `topic_id`           | The `fediverse_instance` topic whose allowlist state changed          |
| `integration_status` | The decision (`pending` \| `approved` \| `blocked`) after this change |
| `changed_by_id`      | Admin user who made the decision (`SET NULL` on user delete)          |
| `reason`             | Optional human-readable reason, max 1000 chars                        |
| `created_at`         | Derived from the UUIDv7 `id`                                          |

`topics__fediverse_instances.integration_status` is kept in sync by a trigger that re-reads the
latest `fediverse_instance_integration_changes` row (by `id DESC`) after every insert, under a
row lock — it does not trust the just-inserted row's value, defending against out-of-order
transaction commits on the same topic.

A partial unique index (`idx_topics__fediverse_instance__hostname_id`) enforces at most one active
(non-deleted, non-merged) `fediverse_instance` topic per `hostname_id`.

The NodeInfo-fetching primitive (`classifyFediverseInstance`,
`backend/services/fediverse-search/adapters/instance-classification.mts`) is wired into instance
creation (`createInstanceFromHostname`, best-effort — a classification failure still creates the
topic with unclassified extension columns), but only classifies the 4 hosts named by
`FEDIVERSE_PEERTUBE_HOST` / `FEDIVERSE_MASTODON_HOST` / `FEDIVERSE_LEMMY_HOST` /
`FEDIVERSE_BLUESKY_HOST`. Arbitrary user-suggested hostnames are out of scope until Phase C adds
generic NodeInfo fetching, so most real instance topics still get "until classified" fields
unpopulated at creation time. See
[Fediverse Instances](../reference-fediverse-instances.md).

URL slug for `fediverse_instance` topics is `instance` (not `fediverse-instance`).
