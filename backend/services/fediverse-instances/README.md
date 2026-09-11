# Fediverse Instances

Fediverse instances are directory entries owned by `topic_type='fediverse_instance'` topics, mirroring how `topic_type='rss_feed'` sources work. They let users suggest and vote on ActivityPub/AT-Proto servers the community wants Voucha to track, and let admins curate which of those servers Voucha will eventually integrate with.

Creation path:

- `createInstanceFromHostname(currentUser, hostname, classifyInstance?)` mirrors `createSourceFromUrl`'s dedup→upvote pattern: resolves/creates the hostname via `resolveHostname`, and if an active `fediverse_instance` topic already exists for that hostname, upvotes it instead of erroring (`status: 'upvoted'`). Otherwise it creates the topic + `topics__fediverse_instances` extension row and auto-upvotes the creator's suggestion (`status: 'created'`). A concurrent creation race degrades to upvote rather than a 409. The API injects its direct-or-worker classifier; transport and provider failures both degrade to null metadata rather than failing creation. Any authenticated user may call this — `createTopic()` is admin-only, so this bespoke flow follows RSS's `create-source-helpers.mts` instead.
- `findExistingInstanceByHostnameId()` backs the dedup check; the partial unique index on `topics (hostname_id) WHERE topic_type='fediverse_instance'` is the DB-level backstop.

## Integration status

Whether Voucha actually federates with an instance is separate from the topic/vote directory entry above. `integration_status` (`'pending' | 'approved' | 'blocked'`) is admin-only and modeled as append-only history, not a mutable column:

- `fediverse_instance_integration_changes` — append-only rows (`topic_id`, `integration_status`, `changed_by_id`, `reason`).
- `getLatestIntegrationStatusChange()` reads the latest row.
- `setIntegrationStatusAsAdmin()` authorizes via `currentUserCanModifyFediverseInstanceIntegrationStatus`, locks the latest change row `FOR UPDATE`, no-ops if the status is unchanged, otherwise inserts a new change row and invalidates the topic cache.
- The `topics__fediverse_instances.integration_status` column is a trigger-maintained projection of the latest change row, kept in sync the same way `rss_feeds.is_enabled` mirrors `rss_feed_enablement_changes`.

## Authorization

`authorization.mts` holds `currentUserCanModifyFediverseInstanceIntegrationStatus`, the only authorization check this service defines — admin-only, matching the API-layer admin gate on `POST /instances/:id/integration-changes`.
