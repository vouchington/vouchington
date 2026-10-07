/* v8 ignore start -- catalog query helpers are validated through schema-static-analysis.test.mts */
import { read } from '../../../../data-stores/psql/index.mts'
import type { TypeViolation } from './name-helpers.mts'

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

/* v8 ignore stop */
