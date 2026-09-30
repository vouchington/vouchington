# Post / Comment Creation Pipeline reference

[Back to Post / Comment Creation Pipeline](post-lifecycle.md)

## Key Files

| Purpose                         | File                                                                   |
| ------------------------------- | ---------------------------------------------------------------------- |
| Post creation service           | `backend/services/posts/create.mts`                                    |
| Entity listener (post events)   | `backend/queues/entity-listeners/processors/posts.mts`                 |
| Entity listener enqueues        | `backend/queues/entity-listeners/enqueues.mts`                         |
| Classifier-run lifecycle        | `backend/services/classifier-runs/`                                    |
| Clearance gate                  | `backend/services/post-clearance/check-clearance.mts`                  |
| Community review add            | `backend/services/communities/publications/add.mts`                    |
| Community review moderation     | `backend/services/communities/publications/moderate.mts`               |
| Community moderation dispatcher | `backend/queues/ai-agents/processors/process-community-moderation.mts` |
| Spam detection                  | `backend/queues/spam-detection/processors.mts`                         |
| Notification reconciliation     | `backend/queues/notifications/enqueues.mts`                            |

## Related

- [AI Agents](./ai-agents.md)
- [Auth Overview](./auth-overview.md)
- [Feeds](./feeds.md)
- [Notifications](./notifications.md)
- [Caching Strategy](./caching-strategy.md)
- [Backend rules](../../../backend/AGENTS.md) — workspace service and data conventions
- [Backend services rules](../../../backend/services/AGENTS.md) — authorization patterns and mocking policy
- [Backend systems rules](../../../backend/queues/AGENTS.md) — queue configuration and job patterns
