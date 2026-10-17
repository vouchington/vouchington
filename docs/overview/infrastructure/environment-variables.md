# Environment Variables

Names, sensitivity and surfaces of environment variables are owned by the typed contract. For
local developer setup, use the credentials/config matrix in
[local-env-vars.md](../../development/local-env-vars.md).

Before env-var or Dynamic Config migrations, run `./dev/config-inventory` from the repository root
for a generated Vouchington checklist covering readers, docs, workflows, package gates, and
DynamicConfig registry state. Shared deployment and local setup metadata comes from the typed
[env-var contract](./env-var-contract.md); deployment changes require a separate handoff to
`vouchington-infra`.
