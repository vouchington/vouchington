# @services/search-params

Parses and validates search query parameters for multiple entity types, producing typed search option objects.

## Key exports

| Parser                          | Route                        | Ownership notes                                                            |
| ------------------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| `parsePostsSearchParams`        | `GET /api/v1/posts`          | Owns pagination plus post search filters.                                  |
| `parseTopicsSearchParams`       | `GET /api/v1/topics`         | Owns pagination plus topic search filters.                                 |
| `parseHostnamesSearchParams`    | `GET /api/v1/hostnames`      | Owns bounded pagination, topic filters, and role-aware moderation filters. |
| `parseRssFeedsSearchParams`     | `GET /api/v1/rss-feeds`      | Owns search filters; the route owns pagination and `apply_mutes`.          |
| `parseRssFeedItemsSearchParams` | `GET /api/v1/rss-feed-items` | Owns pagination plus item search filters.                                  |

Each export is a callable parser with a typed `queryContract`. The contract is reusable metadata,
not automatic publication: the route handler must explicitly pass the parser and any route-owned
contract carriers to `apiQuery('METHOD:/route', ...)`. That opt-in keeps internal parsers and
unrelated routes out of the public OpenAPI document.

Published plural aliases use comma-separated values. Runtime parsing also accepts repeated keys for
legacy callers. Singular aliases remain scalar. Public parsers always retain a bounded `limit`;
callers cannot request the internal `omitLimit` service mode.

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- Pagination and query metadata: [../../modules/pagination/README.md](../../modules/pagination/README.md)
- API fixture and OpenAPI generation: [../../test-helpers/api-fixtures/README.md](../../test-helpers/api-fixtures/README.md)
- Search utils module: [../../modules/search-utils/README.md](../../modules/search-utils/README.md)
