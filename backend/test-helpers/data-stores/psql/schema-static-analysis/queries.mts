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

export async function getModerationRssTargetForeignKeys(): Promise<
  { table_name: string; delete_rule: string }[]
> {
  const { rows } = await read<{ table_name: string; delete_rule: string }>(
    `/* getModerationRssTargetForeignKeys */
      SELECT source_table.relname AS table_name,
        CASE foreign_key.confdeltype
          WHEN 'c' THEN 'CASCADE'
          ELSE foreign_key.confdeltype::text
        END AS delete_rule
      FROM pg_constraint foreign_key
      JOIN pg_class source_table ON source_table.oid = foreign_key.conrelid
      JOIN pg_attribute source_column
        ON source_column.attrelid = foreign_key.conrelid
       AND source_column.attname = 'rss_feed_item_id'
      JOIN pg_attribute target_column
        ON target_column.attrelid = foreign_key.confrelid
       AND target_column.attname = 'id'
      WHERE foreign_key.contype = 'f'
        AND foreign_key.conrelid = ANY($1::regclass[])
        AND foreign_key.confrelid = 'public.rss_feed_items'::regclass
        AND foreign_key.conkey = ARRAY[source_column.attnum]
        AND foreign_key.confkey = ARRAY[target_column.attnum]
      ORDER BY source_table.relname`,
    [
      [
        'public.moderation_cases',
        'public.moderation_reports',
        'public.moderation_report_judgements',
        'public.report_integrity_flags',
      ],
    ],
  )
  return rows
}

/* v8 ignore stop */
