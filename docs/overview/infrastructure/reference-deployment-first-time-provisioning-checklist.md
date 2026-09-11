# Deployment reference

[Back to Deployment](deployment.md)

## First-Time Provisioning Checklist

1. Bootstrap remote state: `vouchington-infra/opentofu/bootstrap/` creates the S3 state bucket and DynamoDB lock table. See the [`vouchington-infra` OpenTofu overview](https://github.com/vouchington/vouchington-infra/tree/main/opentofu) and [operator checklist](https://github.com/vouchington/vouchington-infra/blob/main/opentofu/HUMAN_CHECKLIST.md) for the step-by-step guide.
2. Apply `vouchington-infra/opentofu/global` once for shared `voucha.ai` SES/DKIM/SPF/DMARC/CAA ownership, fixed GitHub OIDC roles, shared ECR repositories, the SOCI builder stack, and account-level S3 Tables Glue ownership.
3. Follow the private repository's reviewed, operator-controlled saved-plan procedure for the
   staging environment.
4. Set all SSM Parameter Store values (see [environment-variables.md](environment-variables.md))
5. Create Aurora databases (`voucha_staging`, `voucha`), run migrations
6. Request SES production access (manual approval, 24-48h)
7. Generate JWT key pairs → set `VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64` and `VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64`
8. Generate `CF_WORKER_SECRET`, set in SSM Parameter Store + CF Worker env
9. Generate VAPID keys for web push → set `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`
10. Dispatch and verify the Cloudflare Worker through the private infrastructure receiver
11. First CI deploy to staging → confirm the matching private receiver run → smoke test. Stop there:
    production promotion and rollback are not live and remain tracked in
    [#10066](https://github.com/jonathanong/filaments/issues/10066).

Account-global apply remains operator-controlled in `vouchington-infra`; its CI apply workflow and
trust are disabled. The apply policy can manage only the existing role ARN allowlist, pass the SOCI
CloudFormation service role, and update the fixed SOCI stack in the configured account and region.
The plan guard rejects unrecognized IAM, OIDC, and CloudFormation resources. Adding a managed role
therefore requires a separately authorized exact saved plan that creates or imports the role and
updates the global apply policy. A later CI activation must establish its protected environment,
bootstrap live trust with operator credentials, and retain a human approval gate.

## Environment Variables

See [environment-variables.md](environment-variables.md) for the complete inventory and
[local-env-vars.md](../../development/local-env-vars.md) for the minimal local development matrix.

## Deploy decoupling & independent safety

Each independent deployable — backend api+workers (one unit), image-resize Lambda, Cloudflare
Worker, and web — validates and dispatches on its own schedule. The private infrastructure
repository owns builds, publication, deployment orchestration, and OpenTofu. The **only** sanctioned application
coupling is api↔workers: they share DB schema and application code, so they deploy as one unit.

`SITEMAPS_ORIGIN`, `BACKEND_ORIGIN`, `WEB_ORIGIN`, and `SITE_ORIGIN` are private-infrastructure-owned
Worker deployment values. Filaments contains only identifier-free local defaults.

The burden this places on every change: a deploy must be forward/backward-compatible with whatever
is currently live, in either deploy order. Concretely, this repo follows **expand/contract**: expand
the reader to accept both the old and new shape, ship that expanded reader everywhere it needs to
run, then — once nothing depends on the old shape — drop the old shape in a later change. This is
the same discipline already used for database migrations (add-nullable-then-backfill-then-enforce),
applied here to cross-service deploy ordering instead of schema ordering.

The repo's concrete precedent is HMAC key rotation for signed sideload image URLs
(`ts-shared/url-signing/`, `VOUCHA_SIDELOAD_SIGNING_KEYS`): keys are a comma-separated list, newest
first. `signPath` signs new URLs with only the first (newest) key, but `verifyPathSignature` accepts
a signature produced by **any** key in the list. Rotating a key is expand (add the new key to the
front, keep the old key verifying) then contract (remove the old key once nothing still needs it) —
with no requirement that every service instance pick up the new key list at the same instant.

The absolute-sideload-URL migration (formerly gated by a cross-workflow wait between the Cloudflare
Worker, backend, and image Lambda deploys) is complete, and that wait has been removed — see
[Static-asset deployment](reference-deployment-s3-static-assets.md). The capability header the wait used to poll for is now
unconditionally present; there is nothing left to coordinate for the current URL _format_. A
**future change to the signing scheme itself** (as opposed to a key rotation) does not get an
automated cross-workflow wait to fall back on — it must use the same expand/contract discipline
directly: ship readers that accept both the old and new scheme, roll out the new scheme, then remove
support for the old one once every reader has the expanded version deployed.

A second precedent is the Cloudflare Worker's RSS discovery `Link` header
(`cloudflare-worker/src/discovery.mts`): it does not enumerate `VALID_RSS_POST_TYPES` and advertise
every catalog value. It only echoes a `post_type` back into the discovery link when the incoming
request itself already carries a single, catalog-valid `post_types` query param. A worker-first
deploy that adds a new value to `@ts-shared/feed-capabilities` therefore cannot cause the worker to
advertise that value on its own — nothing emits it until some upstream caller (the web app) starts
sending requests that carry it, which is itself gated on that caller's own deploy. The coupling to
watch for a new post type is web-backend deploying the same commit out of order, not worker-backend;
follow the same expand/contract discipline there (ship backend acceptance of the new value at or
before the web change that starts requesting it).

## Related

- [Endpoint Migration recipe](../../../.agents/skills/agent-workflow/impact-recipes.md#endpoint-migration) —
  endpoint inventory plus independent rollout and rollback evidence

- [`vouchington-infra` Operator Secrets Checklist](https://github.com/vouchington/vouchington-infra/blob/main/opentofu/OPERATOR-SECRETS-CHECKLIST.md) — condensed
  what-do-I-set checklist for standing up staging or production
- [Environment Variables](environment-variables.md) — runtime configuration inventory
- [Local Env Vars](../../development/local-env-vars.md) — local setup matrix for credentials and config
- [Infrastructure](infrastructure.md) — AWS and edge resource overview
- [Deployment Costs](deployment-costs.md) — monthly cost breakdown across staging, production, and CI/testing
- [Cloudflare Worker rules](../../../cloudflare-worker/CLAUDE.md) — edge routing, auth, and cache policy
- [Backend rules](../../../backend/CLAUDE.md) — service startup and production checks
- [Web rules](../../../web/CLAUDE.md) — Next.js build and runtime conventions
