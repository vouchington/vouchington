// Staging-only one-off that drops and rebuilds the public schema. The infrastructure-owned ECS
// task runs it by name, so it works as a plain Node file and as an entry of the compiled API
// executable. The guard runs before @data-stores/psql is imported so a misconfigured task never
// connects to a database.
import { assertStagingSchemaResetAllowed } from './schema-reset-guard.mts'

const DEADLINE_MS = 20 * 60 * 1000

/* c8 ignore start -- process entrypoint exercised by the infrastructure staging reset task. */
assertStagingSchemaResetAllowed()
const deadline = setTimeout(() => {
  throw new Error('staging reset deadline exceeded')
}, DEADLINE_MS)
try {
  const { write, onGracefulShutdown } = await import('@data-stores/psql')
  const { runMigrations, runConfigDriven, runViews } = await import('@data-stores/psql/migrate')
  // ast-grep-ignore: no-three-sequential-awaits -- the schema must be dropped, recreated, granted and rebuilt in order
  await write('/* resetStagingSchemaDropPublicSchema */ DROP SCHEMA IF EXISTS public CASCADE')
  await write('/* resetStagingSchemaCreatePublicSchema */ CREATE SCHEMA public')
  await write(
    '/* resetStagingSchemaGrantPublicSchemaOwner */ GRANT ALL ON SCHEMA public TO CURRENT_USER',
  )
  await write(
    '/* resetStagingSchemaGrantPublicSchemaUsage */ GRANT USAGE ON SCHEMA public TO PUBLIC',
  )
  await runMigrations()
  await runConfigDriven()
  await runViews()
  await onGracefulShutdown()
} finally {
  clearTimeout(deadline)
}
/* c8 ignore stop */
