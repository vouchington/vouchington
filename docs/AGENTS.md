# Documentation

- Link to canonical values and decisions instead of duplicating them. Use the routed domain and
  owner indexes below to reach the canonical page within the configured three-link budget.
- This repository is public. Keep real operational thresholds, infrastructure identities,
  spend, unit costs, and business projections in private `vouchington/vouchington-docs`.
  Explain mechanisms here. Consult the [private-doc registry](development/docs-moved-to-vouchington-docs.md)
  before moving private material or replacing an apparently missing page.
- Put directory-scoped invariants in the nearest `AGENTS.md`, using concise bullets and owner links.
  Read target-directory instructions explicitly; startup loading does not cover every subtree.
- Put task-triggered procedures in an existing matching skill. Add a thin skill only when no
  existing trigger fits; follow [skill authoring](../.agents/skills/AGENTS.md).
- Put architecture, explanations, examples, command references, and catalogs in their owning
  `docs/**` domain. Local `README.md` files are short entrypoints; skill procedure resources stay
  with their skill. Do not create instruction files solely to satisfy link reachability.
- Keep navigation within the configured three-link reachability budget. Update incoming links,
  fragments, code consumers, and generators when moving a page.
- Save task plans outside Git: an issue/comment, PR description, or durable native plan file.
  Plans have no mandatory template or separate-issue requirement.
- Follow the [pinning policy](development/dependency-updates.md#docs-pinning-policy); avoid
  restating changing versions or configuration values in prose.

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
- [Backend package catalogs](overview/architecture/backend/catalogs/README.md) · [AI agents](overview/architecture/ai-agents/README.md) · [Agent tools](overview/architecture/agent-tools/README.md)
- [Queues](overview/architecture/queues/README.md) · [Services](overview/architecture/services/README.md) · [Shared TypeScript](overview/architecture/typescript-shared/README.md)
- [Web](overview/architecture/web/README.md) · [Email templates](overview/architecture/email-templates/README.md)
- [Infrastructure](overview/infrastructure/README.md) · [Cloudflare Worker](overview/infrastructure/cloudflare-worker/README.md) · [Lambdas](overview/infrastructure/lambdas/README.md)

### Product and API requirements

- [Requirements](requirements/README.md) · [Admin](requirements/admin/README.md) · [Entity anatomy](requirements/anatomy/README.md)
- [API](requirements/api/README.md) · [ActivityPub](requirements/api/activitypub/README.md) · [Bluesky](requirements/api/bluesky/README.md) · [OAuth](requirements/api/oauth/README.md)
- [API catalog](requirements/api/catalog/README.md) · [Community](requirements/community/README.md) · [Content](requirements/content/README.md) · [Articles](requirements/content/articles/README.md)
- [Moderation](requirements/moderation/README.md) · [Navigation](requirements/navigation/README.md) · [Platform](requirements/platform/README.md)
- [Security](requirements/security/README.md) · [SEO](requirements/seo/README.md) · [Trust and safety](requirements/trust-safety/README.md)
- [User flows](requirements/user-flows/README.md) · [Users](requirements/users/README.md)

### Operations and agent references

- [Operations](operations/README.md) · [Runbooks](runbooks/README.md) · [Checklists](checklists/README.md)
- [Prompts](prompts/README.md) · [Scheduled prompts](prompts/SCHEDULED.md) · [Automation templates](prompts/automation/README.md) · [Strategy](strategy/README.md) · [Focused catalog](catalog/README.md)
