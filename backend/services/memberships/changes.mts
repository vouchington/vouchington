import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import { recordMembershipEntitlementEffects } from './entitlement-effects.mts'
import {
  buildMembershipChangesInsert,
  buildLatestMembershipChangeUpdate,
  type MembershipChangeInput,
} from './membership-change-statements.mts'

export type { MembershipChangeInput } from './membership-change-statements.mts'

export class DuplicateStripeMembershipEventError extends Error {
  constructor() {
    super('Stripe event already recorded for a membership change')
  }
}

type MembershipChangeOptions = {
  ignoreDuplicateStripeEvent?: boolean
  query?: QueryExecutor
}

export async function recordMembershipChange(
  options: MembershipChangeInput & MembershipChangeOptions,
): Promise<boolean> {
  const { ignoreDuplicateStripeEvent, query, ...change } = options
  const [recorded] = await recordMembershipChanges([change], { ignoreDuplicateStripeEvent, query })
  return recorded!
}

/** Returns one insertion result per input row; ignored Stripe replays return false. */
export async function recordMembershipChanges(
  changes: readonly MembershipChangeInput[],
  options: MembershipChangeOptions = {},
): Promise<boolean[]> {
  if (changes.length === 0) return []
  if (!options.query) {
    await using query = await beginTransaction()
    const result = await recordMembershipChanges(changes, { ...options, query })
    await query.commit()
    return result
  }

  const run = options.query
  const statement = buildMembershipChangesInsert(changes, options.ignoreDuplicateStripeEvent)
  const { rows } = await run<{
    id: string
    user_id: string
    membership_id: string
    position: number
  }>(statement)
  const insertedIds = rows.map(row => row.id)
  if (insertedIds.length === 0) return changes.map(() => false)

  await recordMembershipEntitlementEffects(
    rows.map(row => ({ membershipChangeId: row.id, userId: row.user_id })),
    run,
  )

  await run(
    buildLatestMembershipChangeUpdate(
      insertedIds,
      rows.map(row => row.membership_id),
    ),
  )
  const insertedPositions = new Set(rows.map(row => row.position))
  return changes.map((_, index) => insertedPositions.has(index + 1))
}
