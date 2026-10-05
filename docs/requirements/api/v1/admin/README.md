# Admin API

Source entrypoint: [backend/api/v1/admin/README.md](../../../../../backend/api/v1/admin/README.md)

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
| PATCH  | `/api/v1/stories/:id`                                        | Update story title                            |
| POST   | `/api/v1/admin/users/:userId/identity-verification-attempts` | Grant an audited identity-verification retry  |
| GET    | `/api/v1/admin/users/:userId/landing-pages`                  | List landing pages for a user                 |
| GET    | `/api/v1/admin/landing-pages/:pageId/analytics`              | Get landing page detail and analytics         |
| GET    | `/api/v1/growth-metrics`                                     | Platform growth KPIs (admin or investor)      |
| GET    | `/api/v1/admin/oauth-clients`                                | List dynamic OAuth clients by verification    |
| PUT    | `/api/v1/admin/oauth-clients/:id/verification`               | Verify a reviewed OAuth client name and URIs  |
| DELETE | `/api/v1/admin/oauth-clients/:id/verification`               | Clear an OAuth client's verification          |
| POST   | `/api/v1/article-syncs`                                      | Enqueue article sync job (returns jobId)      |
| GET    | `/api/v1/article-syncs/:jobId`                               | Poll article sync job status                  |

Classifier threshold management and the human-vote comparison report live under
`/api/v1/admin/classifiers`. Reads are open to moderation staff (administrators and site
moderators); changing a threshold requires an administrator who is not suspended. Every change is
a new audited revision and nothing changes a threshold automatically. See the
[classifier service](../../../../overview/architecture/services/classifiers/README.md#threshold-management)
and the [comparison report](../../../moderation/MODERATION-ANALYTICS.md#classifier-human-vote-comparison).

| Method | Route                                                                                | Description                                                |
| ------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| GET    | `/api/v1/admin/classifiers`                                                          | List classifiers with the active prompt version's defaults |
| GET    | `/api/v1/admin/classifiers/:classifierId/candidates`                                 | List one scope's candidates with effective thresholds      |
| GET    | `/api/v1/admin/classifiers/:classifierId/candidates/:candidateId/thresholds`         | List a candidate's threshold revisions, newest first       |
| PUT    | `/api/v1/admin/classifiers/:classifierId/candidates/:candidateId/threshold`          | Set or clear a candidate override (administrators)         |
| POST   | `/api/v1/admin/classifiers/:classifierId/candidates/:candidateId/threshold/rollback` | Re-apply an earlier revision as a new one (administrators) |
| GET    | `/api/v1/admin/classifiers/:classifierId/human-vote-comparison`                      | Aggregate probabilities and thresholds against human votes |

For import endpoints, see [imports/README.md](./imports/README.md).
For growth metrics details, see [growth-metrics/README.md](./growth-metrics/README.md).

## MCP Clients

The admin MCP endpoint is streamable HTTP at `POST /api/v1/admin/mcp`. Leave [`.mcp.json`](../../../../../.mcp.json) unchanged. It is OAuth-only: the credential is an OAuth access token bound to the admin resource, which only administrators can authorize, carrying `mcp.admin:read` and, for write tools, `mcp.admin:write`. API keys are not accepted and get `401`. OAuth clients discover the resource from `/.well-known/oauth-protected-resource/api/v1/admin/mcp` through the `401` challenge, so register the URL without a static credential and complete the client's OAuth sign-in.

Claude Code (authenticate afterwards from `/mcp`):

```bash
claude mcp add --scope local voucha-admin-mcp --transport http \
  https://staging.voucha.ai/api/v1/admin/mcp
```

Codex:

```bash
codex mcp add voucha-admin-mcp \
  --url https://staging.voucha.ai/api/v1/admin/mcp
```

Every call is recorded in the durable `mcp_call_audit_events` log with the actor, OAuth client,
resource, tool, outcome, timestamp, and the `X-Correlation-Id` returned on the response. The user
MCP route writes the same log, under the API key id when a key made the call. Other
statuses: `403` (not an administrator, or a token missing the scope a tool needs, with an
`insufficient_scope` challenge), `413` (more than 25 JSON-RPC messages in one batch), `429` (rate
limited), and `503` (the audit row could not be stored, so the call did not run). See the
[MCP tools architecture](../../../../overview/architecture/services/mcp-tools/README.md#mcp-audit-log).

The `copyright-notices:read` grant exposes the copyright review queue, public notice, repeat-infringer
accounts, email-intake queue and structured intake detail, guest-capability list, and participant
case detail. Email-intake reads never expose raw MIME, `.eml`, parsed email, or parser errors.
Copyright MCP reads mask claimant and poster contact details before tool output is wrapped; names
remain visible. The two new lists use the same opaque cursor contract as their staff REST routes.

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
| PATCH /api/v1/stories/:id                                       | 2           | None (write) | Auth, update title                                                     |
| POST /api/v1/admin/users/:userId/identity-verification-attempts | 2           | None (write) | Auth, validated support note, durable attempt grant                    |
| GET /api/v1/admin/users/:userId/landing-pages                   | 2           | None         | Auth, opaque cursor-paginated user-scoped landing page list            |
| GET /api/v1/admin/landing-pages/:pageId/analytics               | 3           | None         | Auth, page lookup, analytics + signup attribution                      |
| GET /api/v1/growth-metrics                                      | 2           | None         | 2 phases: auth + 1 parallel batch (5 PostgreSQL + 4 analytics queries) |
| POST /api/v1/article-syncs                                      | 2           | None (write) | Auth, enqueue to Valkey (throttle dedup rate-limits re-triggers)       |
| GET /api/v1/article-syncs/:jobId                                | 2           | None         | Auth, read job state from Valkey queue                                 |

The classifier routes read from the primary, so a staff member sees the revision they just wrote.

| Endpoint                                                                       | Round Trips | Caching      | Notes                                                                                 |
| ------------------------------------------------------------------------------ | ----------- | ------------ | ------------------------------------------------------------------------------------- |
| GET /api/v1/admin/classifiers                                                  | 2           | None         | Auth, one cursor-paginated query                                                      |
| GET /api/v1/admin/classifiers/:classifierId/candidates                         | 3           | None         | Auth, one transaction: classifier check, candidate page, active revisions of the page |
| GET /api/v1/admin/classifiers/:classifierId/candidates/:candidateId/thresholds | 2           | None         | Auth, revision page (one more existence check only when the page is empty)            |
| PUT .../candidates/:candidateId/threshold                                      | 3           | None (write) | Auth, one transaction: candidate lock, validation, deactivate prior, insert new       |
| POST .../candidates/:candidateId/threshold/rollback                            | 3           | None (write) | Same transaction as PUT, plus a read of the revision to restore                       |
| GET /api/v1/admin/classifiers/:classifierId/human-vote-comparison              | 3           | None         | Auth, classifier kind check, one bounded aggregate (at most 1000 batches, 31 days)    |

## Related

- Review queue service: [../../services/post-clearance/](../../../../overview/architecture/services/post-clearance/README.md)
- Crawlers service: [../../services/crawlers/](../../../../overview/architecture/services/crawlers/README.md)
- Stories service: [../../services/stories/](../../../../overview/architecture/services/stories/README.md)
- Imports: [imports/README.md](./imports/README.md)
- Parent: [../AGENTS.md](../../../../../backend/api/AGENTS.md)
