# @services/dynamic-config-admin

Source entrypoint: [backend/services/dynamic-config-admin/README.md](../../../../../backend/services/dynamic-config-admin/README.md)

Central registry and service layer for Valkey-backed `DynamicConfig` namespaces.

## What It Does

- Registers every admin-editable DynamicConfig namespace in code.
- Enforces per-namespace view/update authorization through role arrays; administrators are always allowed.
- Validates field updates, records non-noop changes in `dynamic_config_change_logs`, and exposes recent history.

## Key Exports

| Module         | Functions                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `service.mts`  | `listDynamicConfigNamespaces`, `getDynamicConfigNamespace`, `updateDynamicConfigNamespace`, `listDynamicConfigNamespaceHistory` |
| `registry.mts` | `dynamicConfigRegistry`, `getDynamicConfigRegistryEntry`                                                                        |

## Adding A Namespace

Production configs under `backend/services/**` must be registered here. Add a
`defineDynamicConfigNamespace()` entry in `registry-entries.mts` with:

- a stable `namespace` that matches the underlying `DynamicConfig.key`
- a human label and description for the namespace list and detail panel
- an `access` object with view and update role arrays
- the owning service's `DynamicConfig` instance
- field metadata for every `DynamicConfig.fieldTypes` key, including a description and any
  min/max/integer constraints
- shared constants for numeric `min_value`/`max_value` bounds whenever the owning service validates
  or falls back from invalid values
- a `max_value` for every operator-exposed numeric field, or a documented `max_value_exemption`
  reason when no stable ceiling is appropriate
- namespace validation for cross-field rules or numeric ranges that metadata cannot fully express
- audit expectations covered through `updateDynamicConfigNamespace`
- docs in this README or the owning service README when behavior changes
- UI coverage through `/admin/dynamic-config` Playwright traversal and any needed component tests
- package dependencies for every imported config service
- DynamicConfig test isolation with `closeScopedDynamicConfigContext([config])` for tests that
  mutate shared config instances

The descriptor helper fails fast when a metadata key is missing or no longer exists in the runtime
`DynamicConfig.fieldTypes` map.

Before migrating env vars into Dynamic Config, run `./dev/config-inventory` from the repository
root and review the generated env readers, deployment contracts, docs, package gates, and registry
coverage.

## Background Work Controls

Background page/chunk sizes, per-run budgets, provider lookup page budgets and recovery windows
are read from registered owner namespaces at operation start. Each numeric field uses the shared
bounded-integer reader with a positive default and a hard ceiling matching the admin metadata.
Invalid runtime values fall back to the documented default; valid changes take effect without a
module reload. SQL binds these captured numbers rather than interpolating literal durations.

Recovery dispatch/processing windows use minutes; renewal and engagement claims use hours.
Selectors, claim updates and retry-state decisions share the same owner field. Engagement claims
live under the users owner because engagement delivery already depends on that capability.
Provider lookup page budgets preserve their existing fail-closed behavior when completeness
cannot be established within the cap. Stripe's documented 100-record page and S3's 1,000-key
DeleteObjects maximum remain external protocol bounds.

The namespace detail panel documents every field, current value, default and maximum. The
owner modules below are the canonical field/default/ceiling inventory:

| Namespace                                 | Owning runtime configuration                                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `ai-usage-work-config`                    | [ai-usage limits](../../../../../backend/services/ai-usage/work-limits.mts)                                       |
| `bluesky-follows-work-config`             | [bluesky-follows limits](../../../../../backend/services/bluesky-follows/work-limits.mts)                         |
| `crawl-embeds-work-config`                | [crawl-embeds limits](../../../../../backend/services/crawl-embeds/work-limits.mts)                               |
| `language-detection-work-config`          | [language-detection limits](../../../../../backend/services/language-detection/work-limits.mts)                   |
| `report-integrity-work-config`            | [report-integrity limits](../../../../../backend/services/report-integrity/work-limits.mts)                       |
| `images-work-config`                      | [images limits](../../../../../backend/services/images/work-limits.mts)                                           |
| `openai-background-responses-work-config` | [openai-background-responses limits](../../../../../backend/services/openai-background-responses/work-limits.mts) |
| `openai-moderation-work-config`           | [openai-moderation limits](../../../../../backend/services/openai-moderation/work-limits.mts)                     |
| `entity-cache-work-config`                | [entity-cache limits](../../../../../backend/services/entity-cache/work-limits.mts)                               |
| `hostname-blocking-work-config`           | [hostname-blocking limits](../../../../../backend/services/hostname-blocking/work-limits.mts)                     |
| `moderation-reports-work-config`          | [moderation-reports limits](../../../../../backend/services/moderation-reports/work-limits.mts)                   |
| `communities-work-config`                 | [communities limits](../../../../../backend/services/communities/work-limits.mts)                                 |
| `admin-imports-work-config`               | [admin-imports limits](../../../../../backend/queues/admin-imports/config.mts)                                    |
| `follower-distributions-work-config`      | [follower-distributions limits](../../../../../backend/services/follower-distributions/work-limits.mts)           |
| `oauth-facebook-work-config`              | [oauth-facebook limits](../../../../../backend/services/oauth-facebook/work-limits.mts)                           |
| `oauth-github-work-config`                | [oauth-github limits](../../../../../backend/services/oauth-github/work-limits.mts)                               |
| `oauth-x-work-config`                     | [oauth-x limits](../../../../../backend/services/oauth-x/work-limits.mts)                                         |
| `post-publication-work-config`            | [post-publication limits](../../../../../backend/services/post-publication/work-limits.mts)                       |
| `rss-feed-items-work-config`              | [rss-feed-items limits](../../../../../backend/services/rss-feed-items/work-limits.mts)                           |
| `rss-feeds-work-config`                   | [rss-feeds limits](../../../../../backend/services/rss-feeds/work-limits.mts)                                     |
| `notifications-work-config`               | [notifications limits](../../../../../backend/services/notifications/work-limits.mts)                             |
| `bookmarks-work-config`                   | [bookmarks limits](../../../../../backend/services/bookmarks/work-limits.mts)                                     |
| `urls-domains-blacklist-work-config`      | [urls-domains-blacklist limits](../../../../../backend/services/urls-domains-blacklist/work-limits.mts)           |
| `classifier-runs-work-config`             | [classifier-runs limits](../../../../../backend/services/classifier-runs/work-limits.mts)                         |
| `classifiers-work-config`                 | [classifiers limits](../../../../../backend/services/classifiers/work-limits.mts)                                 |
| `elections-votes-work-config`             | [elections-votes limits](../../../../../backend/services/elections-votes/work-limits.mts)                         |
| `entity-relations-work-config`            | [entity-relations limits](../../../../../backend/services/entity-relations/work-limits.mts)                       |
| `media-delivery-safety-work-config`       | [media-delivery-safety limits](../../../../../backend/services/media-delivery-safety/work-limits.mts)             |
| `posts-work-config`                       | [posts limits](../../../../../backend/services/posts/work-limits.mts)                                             |
| `remote-actors-work-config`               | [remote-actors limits](../../../../../backend/services/remote-actors/work-limits.mts)                             |
| `stories-work-config`                     | [stories limits](../../../../../backend/services/stories/work-limits.mts)                                         |
| `topics-work-config`                      | [topics limits](../../../../../backend/services/topics/work-limits.mts)                                           |
| `user-deletions-work-config`              | [user-deletions limits](../../../../../backend/services/user-deletions/work-limits.mts)                           |
| `ap-inbox-activities-work-config`         | [ap-inbox-activities limits](../../../../../backend/services/ap-inbox-activities/work-limits.mts)                 |
| `engagement-emails-work-config`           | [engagement-emails limits](../../../../../backend/services/engagement-emails/work-limits.mts)                     |
| `recommended-topics-work-config`          | [recommended-topics limits](../../../../../backend/services/recommended-topics/work-limits.mts)                   |
| `stripe-work-config`                      | [stripe limits](../../../../../backend/services/stripe/work-limits.mts)                                           |
| `find-your-friends-work-config`           | [find-your-friends limits](../../../../../backend/queues/find-your-friends/config.mts)                            |
| `crawl-boilerplate-removal-work-config`   | [crawl-boilerplate-removal limits](../../../../../backend/queues/crawl-boilerplate-removal/config.mts)            |
| `vote-weight-work-config`                 | [vote-weight limits](../../../../../backend/services/vote-weight/work-limits.mts)                                 |
| `post-clearance-work-config`              | [post-clearance limits](../../../../../backend/services/post-clearance/work-limits.mts)                           |
| `users-work-config`                       | [users limits](../../../../../backend/services/users/work-limits.mts)                                             |

Existing account-data, membership, copyright, crawl-dispatch and Bedrock namespaces also expose
their recovery windows and additional work bounds; their registry entries use the same numeric
metadata and bounded-reader policy.

## Related

- API route: [../../api/v1/dynamic-config/](../../../../requirements/api/v1/dynamic-config/README.md)
- Audit log: [../dynamic-config-audit/](../dynamic-config-audit/README.md)
- Valkey DynamicConfig: [../../data-stores/valkey/README.md](../../../../development/valkey/README.md)
