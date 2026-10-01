// ECS migration task entry used by the infrastructure-owned deployment workflow. Lives here
// so the deployed image exposes it at the package root, where Node's type stripping
// works and the workspace graph (not a hand-maintained path) provides @data-stores/psql.
import { runAllMigrations } from '@data-stores/psql/migrate'

/* c8 ignore next -- process entrypoint exercised by the infrastructure deployment workflow. */
await runAllMigrations()
