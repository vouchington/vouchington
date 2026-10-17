# Source Of Truth

[Back to Fediverse Staging Interoperability - Runbook](fediverse-staging-interop.md#source-of-truth)

- Implementation: `cloudflare-worker/src/basic-auth.mts`, `backend/api/activitypub/`,
  `backend/services/ap-inbox-activities/`, `backend/queues/activitypub/`,
  and `backend/workers/activitypub/`.
- Infrastructure/config: the deployed staging Worker and API/IO worker revisions.
- CI or deploy workflow: the deployment run that produced `DEPLOYED_SHA`.
- Related docs: [federation architecture](../overview/architecture/fediverse-federation.md),
  current boundaries, and
  [staging Basic Auth](cloudflare-worker-staging-auth.md).
