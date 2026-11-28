import { read } from '@data-stores/psql'

export type SchemaGrowthCatalogTable = {
  table_name: string
  id_type: string | null
  id_default: string | null
  partition_strategy: 'l' | 'r' | null
  partition_key: string | null
}

export async function getSchemaGrowthRegistryCatalog(): Promise<SchemaGrowthCatalogTable[]> {
  const { rows } = await read<SchemaGrowthCatalogTable>(
    `/* getSchemaGrowthRegistryCatalog */
      SELECT
        tables.relname AS table_name,
        id_type.typname AS id_type,
        pg_get_expr(id_default.adbin, id_default.adrelid) AS id_default,
        partitioned.partstrat AS partition_strategy,
        pg_get_partkeydef(tables.oid) AS partition_key
      FROM pg_class tables
      JOIN pg_namespace namespace ON namespace.oid = tables.relnamespace
      LEFT JOIN pg_attribute id_column
        ON id_column.attrelid = tables.oid
       AND id_column.attname = 'id'
       AND NOT id_column.attisdropped
      LEFT JOIN pg_type id_type ON id_type.oid = id_column.atttypid
      LEFT JOIN pg_attrdef id_default
        ON id_default.adrelid = tables.oid
       AND id_default.adnum = id_column.attnum
      LEFT JOIN pg_partitioned_table partitioned ON partitioned.partrelid = tables.oid
      WHERE namespace.nspname = 'public'
        AND tables.relkind IN ('r', 'p')
        AND (
          tables.relkind = 'p'
          OR NOT EXISTS (SELECT 1 FROM pg_inherits WHERE inhrelid = tables.oid)
        )
      ORDER BY tables.relname`,
  )
  return rows
}
