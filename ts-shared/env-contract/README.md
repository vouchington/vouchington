# Environment Contract

Typed metadata for environment variables that need shared static-analysis, local setup, or
deployment policy checks.

The Voucha contract table remains local. Its generic normalization and lookup mechanics are supplied
by `@vouchington/utils/env-contract`, which remains runtime-safe for Filaments tooling. Changes
that affect private deployment configuration require a manual handoff to `vouchington-infra`; that
repository does not import or automatically validate this package.

## Exports

- `ENV_VAR_CONTRACT` is the normalized source of truth.
- `ENV_VAR_CONTRACT_GROUPS` keeps grouped surfaces readable for deployment and local setup checks.
- `envNamesForSurface(surface)` returns names assigned to one contract surface.
- `envContractsByName()` returns contract entries grouped by env-var name.
- `knownPublicEnvNames()` and `knownSecretEnvNames()` expose sensitivity subsets for policy tests.
