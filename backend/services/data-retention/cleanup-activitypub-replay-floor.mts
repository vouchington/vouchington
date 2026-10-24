import type { TransactionQuery } from '@data-stores/psql'
import { getDateFromUUIDv7 } from '@modules/utils/ids'

/** Advance the permanent floor before a bounded delete while holding the ledger cursor lock. */
export async function advanceReplayRejectionFloor(
  query: TransactionQuery,
  kind: 'inbox' | 'outbound',
  page: readonly { at: string; id: string }[],
): Promise<void> {
  // A verified signed date is at most one hour after inbox receipt. An outbound UUIDv7 event
  // can precede its delivery completion by arbitrarily long, so use the identity timestamp.
  const floorAt =
    kind === 'inbox'
      ? page.at(-1)!.at
      : page.reduce<Date | null>((latest, item) => {
          const createdAt = getDateFromUUIDv7(item.id)
          return createdAt && (!latest || createdAt > latest) ? createdAt : latest
        }, null)
  if (!floorAt) return // Unsupported outbound identities are already rejected on admission.
  await query(
    `/* advanceActivityPubReplayRejectionFloor */
     UPDATE activitypub_replay_retention_cursors
     SET rejection_floor_at = GREATEST(
       COALESCE(rejection_floor_at, '-infinity'::timestamptz),
       $2::timestamptz + $3::interval
     ) WHERE is_outbound = $1`,
    [kind === 'outbound', floorAt, kind === 'outbound' ? '0 seconds' : '1 hour'],
  )
}
