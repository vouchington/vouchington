# Analytics Pipeline reference

[Back to Analytics Pipeline](analytics-pipeline.md)

## Table registry

All records share base fields: `event_id UUID`, `event_time TIMESTAMP`, `event_date DATE` (partition key), `env STRING`.

| Table                 | Emitted by                                                               | Key columns                                                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crawler_requests`    | `trackCrawlerRequest`, `trackDomainRateLimitLocked/Deferred`             | `event_type`, `crawler_type`, `domain`, `status_code`, `success`, `error_type`, `duration_ms`, `retry_after_ms`, `remaining_ms`                                                                                              |
| `valkey_cache_calls`  | `trackCacheCall`                                                         | `cache_name`, `batch`, `hits`, `misses`, `bloom_misses`, `duration_ms`                                                                                                                                                       |
| `queue_jobs`          | `trackJobEnqueue`, `trackQueueWorkerJobProgressEvent/CompletedEvent`     | `queue`, `job`, `event`, `count`, `duration_ms`                                                                                                                                                                              |
| `queue_workers`       | `trackQueueWorkerEvent`                                                  | `queue`, `event`                                                                                                                                                                                                             |
| `rss_feed_processing` | `trackRssFeedProcessingTruncated`                                        | `event_type` (`truncated`), `rss_feed_id`, `total_parsed_items`, `valid_items_before_cap`, `returned_items`, `item_cap`, `item_truncated_count`, `category_cap`, `category_truncated_item_count`, `category_truncated_count` |
| `ai_calls`            | `trackAIEmbeddingCall`, `trackAIModerationCall`                          | `kind`, `service`, `model`, `entity_type`, `error_type`, `tokens`, `duration_ms`                                                                                                                                             |
| `web_page_view`       | `recordLandingPageVisit`, `addRecentlyViewed`                            | `page_kind`, `page_id`, `session_id`, `user_id`, `referrer`, `utm_source/medium/campaign/content`                                                                                                                            |
| `web_click`           | `recordLandingPageItemClick`                                             | `page_kind`, `page_id`, `target_kind`, `target_id`, `group_member_id`, `session_id`, `user_id`                                                                                                                               |
| `auth_sessions`       | `trackAuthSessionEvent`                                                  | `event_type` (`created`, `refreshed_authenticated`, `refreshed_anonymous`), `device_id`, `session_id`, `user_id`, `authenticated`                                                                                            |
| `pg_query_timing`     | `recordQueryTiming` (per psql query/cursor, sampled)                     | `annotation`, `pool`, `duration_ms`, `row_count`, `error`, optional `cursor_batches`, optional `pipelined`, optional `batch_size`                                                                                            |
| `pg_pool_stats`       | `startPoolStatsSampler` (per-process gauge)                              | `pool` (`read`, `write`, or `advisory-lock`), `total`, `idle`, `waiting`, `max`                                                                                                                                              |
| `pg_vote_drift`       | `reconcilePostVoteDrift` job (`trackVoteDrift`)                          | `entity_table`, `sampled`, `drifted`, `sample_entity_id`                                                                                                                                                                     |
| `api_usage`           | `trackApiUsage` (via `settleUsage` for each settled MCP or REST request) | `surface`, `credential`, `user_id`, `api_key_id`, `oauth_client_id`, `oauth_grant_id`, `plan`, `scope_class`, `unit`, `units`, `status_code`, `quota_limit`, `duration_ms`                                                   |

For `pg_pool_stats`, `max` is each process pool's effective configured ceiling, including the
`PG_ADVISORY_LOCK_POOL_MAX` override. Pool connections are opened lazily; the ceiling is not an
eager reservation.

`api_usage` is one row per settled MCP or REST request. `surface` is `mcp_user`, `mcp_admin`,
`rest_user`, or `rest_anonymous`, and `credential` is `api_key`, `oauth`, `session`, or
`anonymous`. An MCP row is attributed to the validated identity: the owner `user_id` plus the
`api_key_id` (API key credential) or the public `oauth_client_id` and `oauth_grant_id` (OAuth
credential). A signed-in REST row carries `user_id` only. An anonymous REST row (`rest_anonymous`)
carries no `user_id` and no IP, device, or session identifier, so `user_id` is the one nullable
column. `trackApiUsage` names each stored field, so no raw bearer token or API key can reach the
table. `units` is `1` for a served 2xx or 4xx and `0` for a 429 or an actual 5xx; `quota_limit` is
the request limit selected for the surface, plan, and scope class (a reference level for
`rest_anonymous`, which is never enforced). See
[MCP usage quota](reference-rate-limiting-layer-4-per-route-rate-limiting-backend.md#mcp-usage-quota)
and [REST usage quota](reference-rate-limiting-rest-usage-quota.md).
The `api_usage` Firehose stream and S3 Tables table are tracked in
[#1556](https://github.com/vouchington/vouchington/issues/1556).
