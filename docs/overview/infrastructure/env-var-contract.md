# Typed Env-Var Contract

`@ts-shared/env-contract` is the typed metadata source of truth for environment variables that
need shared static-analysis, local setup, or deployment policy checks.

The package lives at [`ts-shared/env-contract/`](../../../ts-shared/env-contract/) and has no
external npm dependencies. It is safe for Filaments tooling to import without pulling backend, web,
Lambda, or Cloudflare Worker runtime packages into static analysis.

## Contract Shape

The catalog exports normalized records with:

- `name`: canonical environment variable name
- `key`: stable source/surface/name identifier for inventory output
- `sensitivity`: `internal`, `public`, or `secret`
- `sourceOfTruth`: owning configuration surface such as `local-init`, `vouchington-infra`,
  `runtime-public-config`, `web-build`, or `cloudflare-worker`
- `surfaces`: concrete places where the name belongs, such as ECS task environment, ECS secrets,
  local `.env` generation, Lambda env, Cloudflare Worker vars, or web Docker build args

Main helpers:

- `ENV_VAR_CONTRACT`: normalized entries
- `envNamesForSurface(surface)`: names assigned to one surface
- `envContractsByName()`: entries grouped by env-var name
- `knownPublicEnvNames()` / `knownSecretEnvNames()`: sensitivity subsets for policy checks
- `collectTypedEnvContractEntries()` / `collectTypedEnvVarConstants()`: compatibility exports used
  by config-inventory fixtures and repo tooling

## Consumers

- [`static-code-analysis/config-inventory/`](../../../static-code-analysis/config-inventory/) loads
  typed metadata before scanning tracked files, then merges that metadata with observed usage from
  code, docs, workflows, Dockerfiles, and package scripts.
- Filaments uses the contract for local setup output and web build-argument validation. When a
  change affects deployment configuration, hand the affected names, sensitivity, and surfaces to
  the separate `vouchington-infra` repository; that handoff is manual, not an import or automated
  cross-repository validation.

## Regex Discovery

`./dev/config-inventory` still scans tracked repository text for observed env usage. That scan is
intentional: the typed catalog describes where a variable belongs, while regex discovery catches
actual readers, docs, workflow declarations, Docker build args, and stale or undocumented usage.

Constant indirection is typed and explicit. `collectTypedEnvVarConstants()` publishes the supported
constant-to-env-name aliases used by config-inventory for `process.env[CONST_NAME]` and local env
prefix readers. Config-inventory no longer scans arbitrary `const FOO_ENV = 'FOO'` declarations
across the repository, so new indirections that should count as env-var readers must be added to the
typed contract instead of depending on alias inference.

## Adding Or Moving Env Vars

When adding an env var that belongs to a deployment, local setup, public runtime config, or build
surface:

1. Add or update the entry in [`ts-shared/env-contract/index.mts`](../../../ts-shared/env-contract/index.mts).
2. Update runtime code, docs, and tests. For a deployment surface, send the changed names,
   sensitivity, and target surfaces to the private infrastructure owner as a manual handoff.
3. Run `./dev/config-inventory` to check observed usage and metadata output.
4. Run the focused Filaments tests for the touched surfaces:
   `pnpm exec vitest run --project ts-shared ts-shared/env-contract/index.test.mts`,
   and `pnpm exec vitest run --project static-analysis-tools static-code-analysis/config-inventory/**/*.test.mts`.
   Run the private infrastructure repository's own validation separately when that manual handoff
   changes a deployment surface.

Related docs:

- [Environment Variables](./environment-variables.md)
- [Local Env Vars](../../development/local-env-vars.md)
- [Static Code Analysis](../../../static-code-analysis/README.md)
