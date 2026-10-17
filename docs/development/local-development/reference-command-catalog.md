# Command Catalog

[Back to Dev Environment Reference](README.md#command-catalog)

The `dev/` entrypoints are listed by `ls dev/` and described in each script's usage text; this page
keeps only the contracts the scripts do not state.

State-changing command-line interfaces follow one safety contract: standalone `-h` or `--help`
prints usage and exits without loading local configuration or changing state, while unknown, extra,
mixed-help, or incomplete arguments are rejected before files, services, databases, Docker, GitHub,
or other external systems are touched.

Operating-system and host provisioning is intentionally not a `dev/` entrypoint; see the
[system-dependency contract](../system-dependencies.md). Files under `dev/lib/` are sourced
implementation helpers, not commands.

`./dev/db-clean` (also `pnpm run db:clean`) is the destructive database/Valkey primitive behind
higher-level workflows; prefer `./dev/reset` for a complete developer reset. Local PostgreSQL access
must already work without interactive password prompts, so initialization and teardown fail
immediately when credentials are missing rather than prompting.

Before an env-var, Dynamic Config, secret, infrastructure, CI, or package-boundary rename, run
`./dev/audit-rename OLD NEW` to classify every old-name hit, and `./dev/config-inventory` for the
cross-surface checklist of env-var and Dynamic Config readers, local setup, deploy contracts, docs,
and package gates.

No repository command appends Blackboard journal entries; agents use the machine-registered
`vouchington-tooling` MCP tools ([agent-blackboard](../agent-blackboard.md)).
