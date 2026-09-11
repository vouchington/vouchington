# Admin API

Admin-only endpoints for content review, crawler management, story curation, bulk imports, and growth metrics.

Most endpoints require administrator access (`isAdminUser`). The growth metrics endpoint also accepts the `investor` role.

## Endpoints

| Method | Route                                                        | Description                                   |
| ------ | ------------------------------------------------------------ | --------------------------------------------- |
| GET    | `/api/v1/posts/review-queue`                                 | List posts with opaque cursor pagination      |
| GET    | `/api/v1/crawlers`                                           | List crawlers by hostname or referral program |
| PUT    | `/api/v1/crawlers/referral-program`                          | Upsert crawler for a referral program         |
| PATCH  | `/api/v1/crawlers/:id`                                       | Update a crawler                              |
| PUT    | `/api/v1/stories/:storyId/items/:itemId`                     | Add item to story                             |
| DELETE | `/api/v1/stories/:storyId/items/:itemId`                     | Remove item from story                        |
| PUT    | `/api/v1/stories/:storyId/official`                          | Set official item for story                   |
| PATCH  | `/api/v1/stories/:storyId`                                   | Update story title                            |
| POST   | `/api/v1/admin/users/:userId/identity-verification-attempts` | Grant an audited identity-verification retry  |
| GET    | `/api/v1/admin/users/:userId/landing-pages`                  | List landing pages for a user                 |
| GET    | `/api/v1/admin/landing-pages/:pageId/analytics`              | Get landing page detail and analytics         |
| GET    | `/api/v1/growth-metrics`                                     | Platform growth KPIs (admin or investor)      |
| POST   | `/api/v1/article-syncs`                                      | Enqueue article sync job (returns jobId)      |
| GET    | `/api/v1/article-syncs/:jobId`                               | Poll article sync job status                  |

For import endpoints, see [imports/README.md](./imports/README.md).
For CRM endpoints, see [crm/README.md](./crm/README.md).
For growth metrics details, see [growth-metrics/README.md](./growth-metrics/README.md).

## MCP Clients

The admin MCP endpoint is streamable HTTP at `POST /api/v1/admin/mcp`. Configure it in your client with a Bearer token, and leave [`.mcp.json`](../../../../.mcp.json) unchanged.

Claude Code:

```bash
claude mcp add --scope local voucha-admin-mcp --transport http \
  https://staging.voucha.ai/api/v1/admin/mcp \
  --header "Authorization: Bearer ${VOUCHA_ADMIN_MCP_KEY}"
```

Codex:

```bash
codex mcp add voucha-admin-mcp \
  --url https://staging.voucha.ai/api/v1/admin/mcp \
  --bearer-token-env-var VOUCHA_ADMIN_MCP_KEY
```

## Performance

| Endpoint                                                        | Round Trips | Caching      | Notes                                                                  |
| --------------------------------------------------------------- | ----------- | ------------ | ---------------------------------------------------------------------- |
| GET /api/v1/posts/review-queue                                  | 2           | None         | Auth, opaque cursor-paginated search                                   |
| GET /api/v1/crawlers                                            | 2           | None         | Auth, single query (by hostname or referral program)                   |
| PUT /api/v1/crawlers/referral-program                           | 2           | None (write) | Auth, upsert                                                           |
| PATCH /api/v1/crawlers/:id                                      | 2           | None (write) | Auth, update                                                           |
| PUT /api/v1/stories/:storyId/items/:itemId                      | 3           | None (write) | Auth, story lookup, assign item                                        |
| DELETE /api/v1/stories/:storyId/items/:itemId                   | 4           | None (write) | Auth, story lookup, membership check, remove item                      |
| PUT /api/v1/stories/:storyId/official                           | 4           | None (write) | Auth, story lookup, membership check, set official                     |
| PATCH /api/v1/stories/:storyId                                  | 2           | None (write) | Auth, update title                                                     |
| POST /api/v1/admin/users/:userId/identity-verification-attempts | 2           | None (write) | Auth, validated support note, durable attempt grant                    |
| GET /api/v1/admin/users/:userId/landing-pages                   | 2           | None         | Auth, opaque cursor-paginated user-scoped landing page list            |
| GET /api/v1/admin/landing-pages/:pageId/analytics               | 3           | None         | Auth, page lookup, analytics + signup attribution                      |
| GET /api/v1/growth-metrics                                      | 2           | None         | 2 phases: auth + 1 parallel batch (5 PostgreSQL + 4 analytics queries) |
| POST /api/v1/article-syncs                                      | 2           | None (write) | Auth, enqueue to Valkey (throttle dedup rate-limits re-triggers)       |
| GET /api/v1/article-syncs/:jobId                                | 2           | None         | Auth, read job state from Valkey queue                                 |

## Related

- Review queue service: [../../services/post-clearance/](../../../services/post-clearance/README.md)
- Crawlers service: [../../services/crawlers/](../../../services/crawlers/README.md)
- Stories service: [../../services/stories/](../../../services/stories/README.md)
- Imports: [imports/README.md](./imports/README.md)
- Parent: [../CLAUDE.md](../../CLAUDE.md)
