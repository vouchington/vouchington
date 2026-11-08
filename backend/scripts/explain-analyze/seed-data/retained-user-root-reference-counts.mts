import { write } from '@data-stores/psql'
import { ROOT_FAMILIES } from '@services/data-retention/cleanup-retained-identities'

/** Actual fixture sizes for every table checked by the retained-user root delete. */
export async function countRetainedUserRootReferenceRows(): Promise<Record<string, number>> {
  const tables = [
    ...new Set([
      'retained_user_identities',
      ...ROOT_FAMILIES.user.references.map(([table]) => table),
    ]),
  ]
  for (const table of tables) {
    if (!/^[a-z][a-z0-9_]*$/.test(table))
      throw new Error(`Invalid retained reference table ${table}`)
  }
  const counts = tables.map(
    (table, index) =>
      `SELECT $${index + 1}::text AS relation, COUNT(*)::text AS count FROM "${table}"`,
  )
  const result = await write<{ relation: string; count: string }>(
    `/* countRetainedUserRootReferenceRows */ ${counts.join(' UNION ALL ')}`,
    tables,
  )
  if (result.rows.length !== tables.length) throw new Error('Missing retained reference row counts')
  const seededRows: Record<string, number> = {}
  for (const row of result.rows) {
    if (!tables.includes(row.relation) || seededRows[row.relation] !== undefined)
      throw new Error(`Unexpected retained reference relation ${row.relation}`)
    const count = Number(row.count)
    if (!Number.isSafeInteger(count) || count < 0)
      throw new Error(`Invalid retained reference row count for ${row.relation}`)
    seededRows[row.relation] = count
  }
  return seededRows
}
