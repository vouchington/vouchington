import { read } from '@data-stores/psql'

export async function getHistoryTablesWithoutMutationGuards() {
  const { rows } = await read<{ table_name: string }>(`
      SELECT table_row.relname AS table_name
      FROM pg_class table_row JOIN pg_namespace namespace ON namespace.oid = table_row.relnamespace
      WHERE namespace.nspname = 'public' AND table_row.relkind IN ('r', 'p')
        AND table_row.relname ~ '_(changes|revisions)$'
        AND NOT table_row.relispartition
        AND NOT EXISTS (
          SELECT 1 FROM pg_trigger trigger_row JOIN pg_proc function_row ON function_row.oid = trigger_row.tgfoid
          WHERE trigger_row.tgrelid = table_row.oid AND NOT trigger_row.tgisinternal
            AND function_row.proname = 'fn_reject_mutation'
            AND (trigger_row.tgtype::integer & 26) = 26
        ) ORDER BY table_row.relname
    `)
  return rows
}

export async function getHistoryActorContracts() {
  const { rows } = await read<{
    table_name: string
    actor_column: string
    target: string
    deletion: string
    ensured: boolean
  }>(`
      SELECT table_row.relname AS table_name, column_row.attname AS actor_column,
        target.relname AS target, constraint_row.confdeltype AS deletion,
        EXISTS (SELECT 1 FROM pg_trigger trigger_row JOIN pg_proc function_row ON function_row.oid = trigger_row.tgfoid
          WHERE trigger_row.tgrelid = table_row.oid AND NOT trigger_row.tgisinternal
            AND function_row.proname = 'fn_ensure_retained_actor_identity'
            AND (trigger_row.tgtype::integer & 6) = 6) AS ensured
      FROM pg_class table_row JOIN pg_namespace namespace ON namespace.oid = table_row.relnamespace
      JOIN pg_attribute column_row ON column_row.attrelid = table_row.oid
        AND column_row.attname IN ('changed_by_id', 'revised_by_id') AND NOT column_row.attisdropped
      JOIN pg_constraint constraint_row ON constraint_row.conrelid = table_row.oid
        AND constraint_row.contype = 'f' AND constraint_row.conkey = ARRAY[column_row.attnum]::smallint[]
      JOIN pg_class target ON target.oid = constraint_row.confrelid
      WHERE namespace.nspname = 'public' AND table_row.relname ~ '_(changes|revisions)$'
        AND NOT table_row.relispartition ORDER BY table_row.relname
    `)
  return rows
}

export async function getMediaAuthorityProgressColumns() {
  const { rows } = await read<{ column_name: string }>(`
      SELECT attname AS column_name FROM pg_attribute
      WHERE attrelid = 'media_delivery_registry_records'::regclass AND NOT attisdropped
        AND attname = ANY(ARRAY['state', 'claimed_at', 'completed_at', 'delivery_attempt_count', 'next_attempt_at'])
    `)
  return rows
}
