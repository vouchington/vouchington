// Staging-only one-off that drops and rebuilds the public schema. The infrastructure-owned ECS
// task runs it by name, so it works as a plain Node file and as an entry of the compiled API
// executable. The guard runs before @data-stores/psql is imported so a misconfigured task never
// connects to a database.
import { assertStagingSchemaResetAllowed } from './schema-reset-guard.mts'

/* c8 ignore start -- process entrypoint exercised by the infrastructure staging reset task. */
// The deploy waits 240 seconds for the reset task; failing at 180 leaves about 60 seconds for task
// launch (an estimate, not measured) and reports the overrun as an error instead of the platform
// stopping the task partway through.
const DEADLINE_MS = 180 * 1000
// One DROP statement is one transaction, and it locks every dropped table, its indexes, TOAST
// relation and the tables its foreign keys touch (roughly 10 to 20 locks per table). PostgreSQL
// shares max_locks_per_transaction (64 by default) times max_connections (100) lock slots, so one
// DROP SCHEMA CASCADE over hundreds of tables fails with "out of shared memory". 25 relations per
// statement keeps each transaction near 500 locks, an order of magnitude under the default 6400.
const DROP_BATCH_SIZE = 25
// Views go first, then tables. Only relations without partition or inheritance children are
// selected, so a parent is dropped after its children and never locks them in the same batch.
// Extension-owned relations (pg_stat_statements views) are left for DROP SCHEMA to remove.
const RELATION_KINDS = [
  { relkind: 'v', drop: 'DROP VIEW' },
  { relkind: 'm', drop: 'DROP MATERIALIZED VIEW' },
  { relkind: 'r', drop: 'DROP TABLE' },
  { relkind: 'p', drop: 'DROP TABLE' },
] as const

assertStagingSchemaResetAllowed()
const deadline = setTimeout(() => {
  throw new Error('staging reset deadline exceeded')
}, DEADLINE_MS)
try {
  const { write, onGracefulShutdown } = await import('@data-stores/psql')
  const { runMigrations, runConfigDriven, runViews } = await import('@data-stores/psql/migrate')
  for (const { relkind, drop } of RELATION_KINDS) {
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- each batch is its own transaction and the next listing depends on it
      const { rows } = await write<{ name: string }>(
        `/* resetStagingSchemaListLeafRelations */
        SELECT format('%I.%I', n.nspname, c.relname) AS name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = $1
          AND NOT EXISTS (SELECT 1 FROM pg_inherits i WHERE i.inhparent = c.oid)
          AND NOT EXISTS (
            SELECT 1 FROM pg_depend d
            WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e'
          )
        ORDER BY c.oid
        LIMIT ${DROP_BATCH_SIZE}`,
        [relkind],
      )
      if (rows.length === 0) break
      // oxlint-disable-next-line no-await-in-loop -- batches must commit one at a time to bound the locks held
      await write(
        `/* resetStagingSchemaDropRelationBatch */ ${drop} ${rows.map(row => row.name).join(', ')} CASCADE`,
      )
    }
  }
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
