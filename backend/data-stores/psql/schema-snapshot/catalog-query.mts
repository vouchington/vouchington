/* v8 ignore start -- live PostgreSQL catalog adapter; db:snapshot:check covers it */
import type { CatalogQuery } from '@vouchington/postgres/pg-schema-snapshot'
// Keep catalog access independent of bootstrap initialization.
import { read } from '../runtime.mts'

export const catalogQuery: CatalogQuery = (sql, values) =>
  read(sql, values === undefined ? undefined : [...values])
/* v8 ignore stop */
