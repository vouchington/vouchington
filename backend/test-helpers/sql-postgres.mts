import { read } from '@data-stores/psql'

export async function getPublicBaseTableNamesForTest(): Promise<Set<string>> {
  const { rows } = await read<{ table_name: string }>(
    `/* getPublicBaseTableNamesForTest */
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'`,
  )
  return new Set(rows.map(row => row.table_name))
}
