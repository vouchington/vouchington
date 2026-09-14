/* v8 ignore start -- catalog query helper is validated through schema-static-analysis.test.mts */
import { read } from '../../../../data-stores/psql/index.mts'
import { type TimestampConventionViolation } from './conventions.mts'

export async function getTimestampConventionViolations(): Promise<TimestampConventionViolation[]> {
  const { rows } = await read<TimestampConventionViolation>(
    `/* getTimestampConventionViolations */
      WITH public_tables AS (
        SELECT pg_class.oid, pg_class.relname
        FROM pg_class
        JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
        WHERE pg_namespace.nspname = 'public'
          AND pg_class.relkind IN ('r', 'p')
          AND NOT EXISTS (
            SELECT 1
            FROM pg_inherits
            WHERE pg_inherits.inhrelid = pg_class.oid
          )
      ),
      columns AS (
        SELECT
          public_tables.oid AS table_oid,
          public_tables.relname AS table_name,
          pg_attribute.attname AS column_name,
          pg_get_expr(pg_attrdef.adbin, pg_attrdef.adrelid) AS column_default,
          information_schema.columns.data_type,
          information_schema.columns.generation_expression
        FROM public_tables
        JOIN pg_attribute ON pg_attribute.attrelid = public_tables.oid
        JOIN information_schema.columns
          ON information_schema.columns.table_schema = 'public'
         AND information_schema.columns.table_name = public_tables.relname
         AND information_schema.columns.column_name = pg_attribute.attname
        LEFT JOIN pg_attrdef
          ON pg_attrdef.adrelid = public_tables.oid
         AND pg_attrdef.adnum = pg_attribute.attnum
        WHERE pg_attribute.attnum > 0
          AND NOT pg_attribute.attisdropped
      ),
      uuidv7_id_tables AS (
        SELECT table_oid, table_name
        FROM columns
        WHERE column_name = 'id'
          AND column_default = 'uuidv7()'
      )
      SELECT uuidv7_id_tables.table_name, 'missing-created-at' AS problem, NULL::text AS detail
      FROM uuidv7_id_tables
      WHERE NOT EXISTS (
        SELECT 1
        FROM columns
        WHERE columns.table_oid = uuidv7_id_tables.table_oid
          AND columns.column_name = 'created_at'
      )

      UNION ALL

      SELECT
        uuidv7_id_tables.table_name,
        'created-at-not-derived-from-uuidv7-id' AS problem,
        columns.generation_expression AS detail
      FROM uuidv7_id_tables
      JOIN columns
        ON columns.table_oid = uuidv7_id_tables.table_oid
       AND columns.column_name = 'created_at'
      WHERE columns.generation_expression IS DISTINCT FROM 'uuid_extract_timestamp(id)'

      UNION ALL

      SELECT public_tables.relname AS table_name, 'missing-updated-at' AS problem, NULL::text
      FROM public_tables
      WHERE NOT EXISTS (
        SELECT 1
        FROM columns
        WHERE columns.table_oid = public_tables.oid
          AND columns.column_name = 'updated_at'
      )

      UNION ALL

      SELECT columns.table_name, 'timestamp-without-time-zone' AS problem, columns.column_name
      FROM columns
      WHERE columns.data_type = 'timestamp without time zone'
      ORDER BY table_name, problem, detail`,
  )
  return rows
}
/* v8 ignore stop */
