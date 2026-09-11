/* v8 ignore start -- live PostgreSQL catalog adapter; db:snapshot:check covers it */
import type { CatalogQuery } from '@vouchington/postgres/pg-schema-snapshot'
import { read } from '../index.mts'

export const catalogQuery: CatalogQuery = (sql, values) =>
  read(sql, values === undefined ? undefined : [...values])
/* v8 ignore stop */
