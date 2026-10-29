import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

export async function readCopyrightMinimalPurgeGeneration(
  query: TransactionQuery,
  noticeId: string,
  lock = false,
): Promise<string> {
  const statement = sql`/* readCopyrightMinimalPurgeGeneration */
    SELECT proof_generation FROM copyright_notice_retained_identities WHERE id = ${noticeId}`
  if (lock) statement.append(sql` FOR UPDATE`)
  const { rows } = await query<{ proof_generation: string }>(statement)
  const generation = rows[0]?.proof_generation
  if (generation === undefined) throw new Error('Copyright retained case generation is missing')
  return generation
}

/** Lock only after the page's child DELETE, then roll back if a semantic writer changed the case. */
export async function copyrightMinimalPurgeGenerationMatches(
  query: TransactionQuery,
  noticeId: string,
  expected: string,
): Promise<boolean> {
  const current = await readCopyrightMinimalPurgeGeneration(query, noticeId, true)
  return current === expected
}
