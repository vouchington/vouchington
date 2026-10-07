/* v8 ignore start -- catalog query helpers are validated through schema-static-analysis.test.mts */
import { read } from '../../../../data-stores/psql/index.mts'
import type { TypeViolation } from './name-helpers.mts'
import { COMMENT_EXEMPT_COLUMN_NAMES, type CommentViolation } from './conventions.mts'

export async function getTypeViolations(udtName: 'json' | 'varchar'): Promise<TypeViolation[]> {
  const { rows } = await read<TypeViolation>(
    `/* getSchemaTypeViolations */
      SELECT table_name, column_name, data_type, udt_name
      FROM information_schema.columns
      JOIN pg_class ON pg_class.relname = information_schema.columns.table_name
      JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
      WHERE information_schema.columns.table_schema = 'public'
        AND pg_namespace.nspname = 'public'
        AND pg_class.relkind IN ('r', 'p')
        AND udt_name = $1
      ORDER BY table_name, column_name`,
    [udtName],
  )
  return rows
}

export async function getCommentViolations(): Promise<CommentViolation[]> {
  const { rows } = await read<CommentViolation>(
    `/* getSchemaCommentViolations */
      WITH public_tables AS (
        SELECT pg_class.oid, pg_class.relname, pg_class.relkind
        FROM pg_class
        JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
        WHERE pg_namespace.nspname = 'public'
          AND pg_class.relkind IN ('r', 'p', 'v', 'm')
          AND NOT EXISTS (
            SELECT 1 FROM pg_depend
            WHERE pg_depend.classid = 'pg_class'::regclass
              AND pg_depend.objid = pg_class.oid AND pg_depend.deptype = 'e'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM pg_inherits
            WHERE pg_inherits.inhrelid = pg_class.oid
          )
      )
      SELECT
        CASE relkind
          WHEN 'r' THEN 'table'
          WHEN 'p' THEN 'table'
          WHEN 'v' THEN 'view'
          WHEN 'm' THEN 'materialized-view'
        END AS kind,
        relname AS relation_name,
        NULL::text AS column_name
      FROM public_tables
      WHERE obj_description(oid, 'pg_class') IS NULL

      UNION ALL

      SELECT
        CASE public_tables.relkind
          WHEN 'r' THEN 'table'
          WHEN 'p' THEN 'table'
        END AS kind,
        public_tables.relname AS relation_name,
        pg_attribute.attname AS column_name
      FROM public_tables
      JOIN pg_attribute ON pg_attribute.attrelid = public_tables.oid
      WHERE public_tables.relkind IN ('r', 'p')
        AND pg_attribute.attnum > 0
        AND NOT pg_attribute.attisdropped
        AND pg_attribute.attname <> ALL($1)
        AND col_description(public_tables.oid, pg_attribute.attnum) IS NULL
      ORDER BY kind, relation_name, column_name NULLS FIRST`,
    [COMMENT_EXEMPT_COLUMN_NAMES],
  )
  return rows
}

/* v8 ignore stop */
