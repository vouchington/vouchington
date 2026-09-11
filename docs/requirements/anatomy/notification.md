# Notification Anatomy

Notifications are per-user inbox events stored in the `notifications` table, RANGE-partitioned by
`user_id` — see [partitioning strategy](../../overview/architecture/partitioning-strategy.md).

## Fields and lifecycle

| Field                             | Meaning                                                                                                           |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `entity_type`                     | Event kind, including community application decision, role change, ownership transfer, and weekly activity digest |
| `event_key`                       | Stable per-recipient idempotency key; remains unique after dismissal                                              |
| `community_id`                    | Optional community context for lifecycle events                                                                   |
| `target_entity` / `target_intent` | Preferred structured navigation target                                                                            |
| `target_path`                     | Nullable legacy path fallback                                                                                     |
| `read_at` / `deleted_at`          | Read and dismissed state                                                                                          |

Lifecycle notifications target the community entity. The combined activity digest and reporter
review notifications target the notifications inbox intent. In-app rows and browser push are two
delivery surfaces for the same durable row.

Community digest vacation suppression is an independent membership preference documented by the [notifications architecture](../../overview/architecture/notifications.md#community-lifecycle-and-digest).
