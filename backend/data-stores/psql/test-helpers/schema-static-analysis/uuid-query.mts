/* v8 ignore start -- catalog query helper is validated through schema-static-analysis.test.mts */
import { read } from '../../index.mts'
import type { UuidConventionViolation } from './conventions.mts'

export async function getUuidConventionViolations(): Promise<UuidConventionViolation[]> {
  const { rows } = await read<UuidConventionViolation>(
    `/* getUuidConventionViolations */
      WITH public_tables AS (
        SELECT pg_class.oid, pg_class.relname
        FROM pg_class
        JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
        WHERE pg_namespace.nspname = 'public'
          AND pg_class.relkind IN ('r', 'p')
          AND NOT EXISTS (
            SELECT 1 FROM pg_inherits WHERE pg_inherits.inhrelid = pg_class.oid
          )
      ),
      uuid_columns AS (
        SELECT
          public_tables.oid AS table_oid,
          public_tables.relname AS table_name,
          pg_attribute.attnum,
          pg_attribute.attname AS column_name,
          pg_get_expr(pg_attrdef.adbin, pg_attrdef.adrelid) AS column_default
        FROM public_tables
        JOIN pg_attribute ON pg_attribute.attrelid = public_tables.oid
        JOIN pg_type ON pg_type.oid = pg_attribute.atttypid
        LEFT JOIN pg_attrdef
          ON pg_attrdef.adrelid = public_tables.oid
         AND pg_attrdef.adnum = pg_attribute.attnum
        WHERE pg_attribute.attnum > 0
          AND NOT pg_attribute.attisdropped
          AND pg_type.typname = 'uuid'
      ),
      partition_child_key_columns AS (
        SELECT parent_table.oid AS table_oid, parent_column.attnum
        FROM public_tables parent_table
        JOIN pg_attribute parent_column
          ON parent_column.attrelid = parent_table.oid
         AND parent_column.attnum > 0
         AND NOT parent_column.attisdropped
        JOIN pg_inherits inheritance ON inheritance.inhparent = parent_table.oid
        JOIN pg_attribute child_column
          ON child_column.attrelid = inheritance.inhrelid
         AND child_column.attname = parent_column.attname
         AND NOT child_column.attisdropped
        GROUP BY parent_table.oid, parent_column.attnum
        HAVING bool_and(EXISTS (
          SELECT 1
          FROM pg_constraint child_constraint
          WHERE child_constraint.conrelid = inheritance.inhrelid
            AND child_constraint.contype IN ('p', 'f', 'u')
            AND child_column.attnum = ANY(child_constraint.conkey)
        ))
      ),
      uuid_key_columns AS (
        SELECT pg_constraint.conrelid AS table_oid, unnest(pg_constraint.conkey) AS attnum
        FROM pg_constraint
        WHERE pg_constraint.contype IN ('p', 'f', 'u')
        UNION
        SELECT pg_index.indrelid AS table_oid, unnest(pg_index.indkey::int2[]) AS attnum
        FROM pg_index
        WHERE pg_index.indisunique
        UNION
        SELECT table_oid, attnum FROM partition_child_key_columns
      )
      SELECT table_name, column_name, 'uuid-column-without-key-constraint' AS problem
      FROM uuid_columns
      WHERE NOT EXISTS (
        SELECT 1
        FROM uuid_key_columns
        WHERE uuid_key_columns.table_oid = uuid_columns.table_oid
          AND uuid_key_columns.attnum = uuid_columns.attnum
      )
      UNION ALL
      SELECT table_name, column_name, 'uuid-id-without-uuidv7-default' AS problem
      FROM uuid_columns
      WHERE column_name = 'id'
        AND column_default IS DISTINCT FROM 'uuidv7()'
      ORDER BY table_name, column_name, problem`,
  )
  return rows
}
/* v8 ignore stop */
