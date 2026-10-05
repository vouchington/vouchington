import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Read the canonical ledger enum rather than maintaining another label list. */
export async function readCopyrightLifecycleEventTypes(): Promise<string[]> {
  const { rows } = await read<{ label: string }>(sql`/* readCopyrightLifecycleEventTypes */
    SELECT enum.enumlabel AS label
    FROM pg_enum enum JOIN pg_type type ON type.oid = enum.enumtypid
    WHERE type.typname = 'copyright_notice_lifecycle_change_types'
    ORDER BY enum.enumsortorder
  `)
  if (!rows.length) throw new Error('The copyright lifecycle change enum has no values')
  return rows.map(row => row.label)
}
