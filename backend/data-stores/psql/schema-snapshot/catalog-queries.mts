/* v8 ignore start -- catalog readers require a live database; db:snapshot:check covers them */
import { readSchemaCatalog as readSchemaCatalogFromPostgres } from '@vouchington/postgres/pg-schema-snapshot'
import { beginTransaction } from '../transactions.mts'

/**
 * `pg_get_indexdef` and `pg_get_expr` print timestamptz constants in the session TimeZone, so the
 * catalog is read in one transaction pinned to UTC. Snapshot generation and live verification then
 * render identical text on any host.
 */
export async function readSchemaCatalog() {
  await using transaction = await beginTransaction()
  await transaction("/* readSchemaCatalog */ SET LOCAL TimeZone = 'UTC'")
  const catalog = await readSchemaCatalogFromPostgres((sql, values) =>
    transaction(sql, values === undefined ? undefined : [...values]),
  )
  await transaction.commit()
  return catalog
}
/* v8 ignore stop */
