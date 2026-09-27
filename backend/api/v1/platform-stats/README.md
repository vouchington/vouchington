# Platform Stats API

Public statistics about the platform.

## Endpoints

| Method | Route                    | Authentication | Description             |
| ------ | ------------------------ | -------------- | ----------------------- |
| GET    | `/api/v1/platform-stats` | Optional       | Get platform statistics |

## GET /api/v1/platform-stats

Returns the same aggregate platform statistics for every viewer. Anonymous and authenticated
requests share the existing `platform_stats_anon` application cache, with the configured short
cache TTL (60 seconds by default) and existing search-cache invalidation. Anonymous responses
alone include public `Cache-Control` headers for CDN caching. Authentication and rate limiting
still run before reading the cache.

Response is streamed via `streamJsonObject`.

## Performance

| Endpoint                   | Aggregate SQL queries | Caching                                   | Notes                                           |
| -------------------------- | --------------------- | ----------------------------------------- | ----------------------------------------------- |
| GET /api/v1/platform-stats | 1 cold; 0 warm        | Valkey: all viewers; HTTP: anonymous only | Authenticated requests retain their auth lookup |

The aggregate SQL is unchanged. A cold anonymous request followed by two authenticated requests
executes one aggregate query instead of three while the entry remains fresh. The regression test
owns a private Valkey container so parallel shared-cache invalidation cannot disturb this proof;
run it in `backend-platform-stats-cache` (see the [project reference](../../../../docs/development/reference-project-name-reference.md)).

## Related

- Service: [../../../services/platform-stats/](../../../services/platform-stats/README.md)
- Parent: [../../AGENTS.md](../../AGENTS.md)
