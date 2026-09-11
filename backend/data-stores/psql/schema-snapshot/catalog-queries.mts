/* v8 ignore start -- catalog readers require a live database; db:snapshot:check covers them */
import { readSchemaCatalog as readSchemaCatalogFromPostgres } from '@vouchington/postgres/pg-schema-snapshot'
import { catalogQuery } from './catalog-query.mts'

export async function readSchemaCatalog() {
  return readSchemaCatalogFromPostgres(catalogQuery)
}
/* v8 ignore stop */
