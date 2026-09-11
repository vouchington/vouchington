import {
  buildSchemaSnapshot as buildFromPostgres,
  type SchemaCatalog,
  type SchemaSnapshot,
} from '@vouchington/postgres/pg-schema-snapshot'
import { PARTITION_POLICIES, UNBOUNDED_UNPARTITIONED_TABLES } from '../schema-growth-registry.mts'

const schemaGrowthMaps = {
  partitionPolicies: PARTITION_POLICIES,
  unboundedUnpartitionedTables: new Set(UNBOUNDED_UNPARTITIONED_TABLES.keys()),
}

export function buildSchemaSnapshot(catalog: SchemaCatalog): SchemaSnapshot {
  return buildFromPostgres(catalog, schemaGrowthMaps)
}
