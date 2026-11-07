import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { lockAdvisoryKeysInOrder } from '../../../services/copyright-notices/advisory-key-locks.mts'
import { recordRestrictionAppealReversalEvents } from '../../../services/copyright-notices/claimant-misuse-ledger.mts'

/** Records an empty batch, then the same batch twice, and counts the notice's events. */
export async function recordTestAppealReversalEventsTwice(input: {
  noticeId: string
  restrictionIds: string[]
}): Promise<number> {
  const batch = { ...input, recordedAt: new Date() }
  await using transaction = await beginTransaction()
  await recordRestrictionAppealReversalEvents(transaction, { ...batch, restrictionIds: [] })
  await recordRestrictionAppealReversalEvents(transaction, batch)
  await recordRestrictionAppealReversalEvents(transaction, batch)
  const { rows } = await transaction<{ total: number }>(sql`/* countTestAppealReversalEvents */
    SELECT count(*)::int AS total FROM copyright_claimant_misuse_events
    WHERE copyright_notice_id = ${input.noticeId}
  `)
  return rows[0]?.total ?? 0
}

/** Locks `keys` in one transaction, then reports per probe key whether a second transaction could take it. */
export async function probeTestAdvisoryKeyLocksHeldByBatch(input: {
  keys: readonly string[]
  probeKeys: readonly string[]
}): Promise<boolean[]> {
  await using holder = await beginTransaction()
  await lockAdvisoryKeysInOrder(holder, [])
  await lockAdvisoryKeysInOrder(holder, input.keys)
  await using contender = await beginTransaction()
  const { rows } = await contender<{
    acquired: boolean
  }>(sql`/* probeTestAdvisoryKeyLocksHeldByBatch */
    SELECT pg_try_advisory_xact_lock(hashtextextended(probe.key, 0)) AS acquired
    FROM unnest(${input.probeKeys}::text[]) WITH ORDINALITY AS probe(key, position)
    ORDER BY probe.position
  `)
  return rows.map(row => row.acquired)
}
