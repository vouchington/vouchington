# Documentation

## What belongs in docs

- Docs hold only why (decisions, rationale, rejected alternatives), business impact, and architecture
  as orientation (a map of where concerns live and how they connect, not an inventory). Human runbooks
  and not-yet-enforced invariants are also allowed.
- Delete anything readable from code: routes, schemas, config, constants, file lists, commands,
  per-package or per-queue catalogs, helper APIs. If a doc exists only because the code is hard to
  follow, file an issue to fix the code instead.
- Config values live in dynamic config or config files, never restated in docs. Avoid numbers that
  can drift from code (limits, thresholds, timeouts, counts, versions, sizes); numbers fixed by an
  external spec or law are fine.
- No history (formerly, migrated, cutover, dated inventories, private-repo issue refs) and no plans;
  save plans in an issue, PR description, or native plan file.
- This repository is public. Spend, unit costs, prod-tuned values, operator access, strategy, and
  legal-posture gaps belong in private `vouchington/vouchington-docs`; consult the
  [private-doc registry](development/docs-moved-to-vouchington-docs.md) before moving private
  material or replacing an apparently missing page.
- Put directory-scoped invariants in the nearest `AGENTS.md` and task procedures in a matching skill
  ([skill authoring](../.agents/skills/AGENTS.md)). Link to canonical owners instead of duplicating.
  Keep navigation within the three-link reachability budget and update incoming links when moving a page.

## Domain and owner indexes

These routes are linked directly from this instruction file so a domain index, its owner index, and
the leaf page fit the configured navigation depth. Keep each leaf inventory in its canonical owner;
do not repeat those inventories in [docs/README.md](README.md) or the
[focused catalog](catalog/README.md).

### Development

- [Development](development/README.md) · [CI](development/ci/README.md) · [Harness setup](development/harnesses/README.md)
- [Local development](development/local-development/README.md) · [Issue labels](development/local-development/agent-issue-labels/README.md)
- [PostgreSQL](development/postgresql/README.md) · [Schema snapshots](development/postgresql/schema-snapshot/README.md) · [Explain Analyze](development/postgresql/explain-analyze/README.md)
- [Valkey](development/valkey/README.md) · [Static analysis](development/quality/static-code-analysis/README.md) · [Integration tests](development/testing/integration-tests/README.md)
- [Playwright](development/testing/playwright/README.md) · [Storybook](development/testing/storybook/README.md)

### Architecture and infrastructure

- [Overview](overview/README.md) · [Architecture](overview/architecture/README.md) · [Backend](overview/architecture/backend/README.md)
- [AI agents](overview/architecture/ai-agents/README.md) · [MCP tools](overview/architecture/mcp/README.md)
- [Queues](overview/architecture/queues/README.md) · [Services](overview/architecture/services/README.md) · [Shared TypeScript](overview/architecture/typescript-shared/README.md)
- [Web](overview/architecture/web/README.md) · [Email templates](overview/architecture/email-templates/README.md)
- [Infrastructure](overview/infrastructure/README.md) · [Cloudflare Worker](overview/infrastructure/cloudflare-worker/README.md) · [Lambdas](overview/infrastructure/lambdas/README.md)

### Product and API requirements

- [Requirements](requirements/README.md) · Admin · Entity anatomy
- [API](requirements/api/README.md) · ActivityPub · Bluesky · OAuth
- [Moderation](requirements/moderation/README.md) · [Navigation](requirements/navigation/README.md) · [Platform](requirements/platform/README.md)
- [Security](requirements/security/README.md) · [SEO](requirements/seo/README.md) · [Trust and safety](requirements/trust-safety/README.md)
- [User flows](requirements/user-flows/README.md) · [Users](requirements/users/README.md)

### Operations and agent references

- [Operations](operations/README.md) · [Runbooks](runbooks/README.md) · [Checklists](checklists/README.md)
- [Prompts](prompts/README.md) · [Scheduled prompts](prompts/SCHEDULED.md) · [Automation templates](prompts/automation/README.md) · [Focused catalog](catalog/README.md)
