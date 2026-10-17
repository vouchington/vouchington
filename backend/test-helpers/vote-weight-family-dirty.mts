import { v7 } from 'uuid'
import { createVoteWeightDispatchUserAt } from './vote-weight-dispatch.mts'
import { beginTransaction, read } from '@data-stores/psql'
import { upsertMembershipSourceState } from '../services/memberships/projections/create.mts'
import sql from 'sql-template-strings'

/** Keep a real family mutation uncommitted while a dispatcher scans the writer. */
export async function withHeldFamilyVoteWeightCancellation(
  userId: string,
  sourceId: string,
  whileUncommitted: (updatedAt: Date) => Promise<void>,
): Promise<Date> {
  const { rows } = await read<{
    membership_product_id: string
    membership_provider_lineage_id: string
    effective_at: Date
    expires_at: Date | null
  }>(sql`/* withHeldFamilyVoteWeightCancellation:source */
    SELECT membership_product_id, membership_provider_lineage_id, effective_at, expires_at
    FROM membership_source_states WHERE membership_source_id = ${sourceId} AND source_kind = 'family'`)
  const source = rows[0]
  if (!source) throw new Error('Family source fixture missing')

  await using transaction = await beginTransaction()
  await transaction(sql`/* withHeldFamilyVoteWeightCancellation:lockUser */
    SELECT id FROM users WHERE id = ${userId} FOR UPDATE`)
  const terminalAt = new Date()
  const outcome = await upsertMembershipSourceState(
    { id: sourceId, kind: 'family', lineageId: source.membership_provider_lineage_id },
    source.membership_product_id,
    'cancelled',
    {
      authoritativeEffectiveAt: null,
      effectiveAt: source.effective_at,
      expiresAt: source.expires_at,
      terminalEffectiveAt: terminalAt,
      transitionEffectiveAt: terminalAt,
    },
    false,
    transaction,
  )
  if (!outcome.advanced) throw new Error('Family source fixture did not advance')
  const { rows: updatedRows } = await transaction<{ updated_at: Date }>(
    sql`/* withHeldFamilyVoteWeightCancellation:updatedAt */
      SELECT updated_at FROM membership_source_states WHERE membership_source_id = ${sourceId}`,
  )
  const updatedAt = updatedRows[0]?.updated_at
  if (!updatedAt) throw new Error('Family source fixture missing updated timestamp')
  await whileUncommitted(updatedAt)
  await transaction.commit()
  return updatedAt
}

export async function createFamilyVoteWeightDirtyUser(at: Date) {
  return {
    userId: await createVoteWeightDispatchUserAt(at),
    afterId: v7({ msecs: at.getTime() - 1 }),
  }
}
