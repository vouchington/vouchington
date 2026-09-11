# Email Templates

React Email templates for Voucha emails.

Follow the backend workflow in [backend/CLAUDE.md](../backend/CLAUDE.md), the monorepo map in
[MONOREPO.md](../docs/development/MONOREPO.md), and [README.md](README.md) for the template inventory,
authoring workflow, and commands. Before writing user-facing email copy, load the
[voucha-brand skill](../.agents/skills/voucha-brand/SKILL.md). Before adding or changing a Vitest
test, fixture, or mock, load the
[vitest-test-authoring skill](../.agents/skills/vitest-test-authoring/SKILL.md).

The package exports prebuilt `dist/index.mjs` for `@email-templates/core` consumers. Keep React Email, React, and React DOM out of `backend/package.json` runtime dependencies; they should stay bundled into this workspace's build output.

## Template Guidance

- Recommendation-style emails must mirror an existing aside or recommendation source in the app before you write the email copy.
