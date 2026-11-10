import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { onTestFinished } from 'vitest'

type QueuedMembershipGrantInput = {
  durationDays?: number
  grantedById: string
  productId: string
  userId: string
}

export async function insertQueuedMembershipGrant(
  input: QueuedMembershipGrantInput,
): Promise<string> {
  await using transaction = await beginTransaction()
  const grantId = await insertQueuedMembershipGrantOn(transaction, input)
  await transaction.commit()
  return grantId
}

/** Inserts a queued grant and leaves the transaction open until release. Does not lock users. */
export async function holdUncommittedQueuedMembershipGrant(
  input: QueuedMembershipGrantInput,
): Promise<{ grantId: string; release: () => Promise<void> }> {
  const inserted = Promise.withResolvers<string>()
  const release = Promise.withResolvers<void>()
  const hold = keepQueuedMembershipGrantUncommitted(input, inserted, release)
  void hold.catch((err: unknown) => inserted.reject(err))
  onTestFinished(() => finishHeldQueuedMembershipGrant(release, hold).catch(() => undefined))
  return {
    grantId: await inserted.promise,
    release: () => finishHeldQueuedMembershipGrant(release, hold),
  }
}

async function keepQueuedMembershipGrantUncommitted(
  input: QueuedMembershipGrantInput,
  inserted: PromiseWithResolvers<string>,
  release: PromiseWithResolvers<void>,
): Promise<void> {
  await using transaction = await beginTransaction()
  await holdQueuedMembershipGrantUntilRelease(input, transaction, inserted, release)
}

async function holdQueuedMembershipGrantUntilRelease(
  input: QueuedMembershipGrantInput,
  transaction: QueryExecutor & { commit(): Promise<void> },
  inserted: PromiseWithResolvers<string>,
  release: PromiseWithResolvers<void>,
): Promise<void> {
  inserted.resolve(await insertQueuedMembershipGrantOn(transaction, input))
  await release.promise
  await transaction.commit()
}

function finishHeldQueuedMembershipGrant(
  release: PromiseWithResolvers<void>,
  hold: Promise<void>,
): Promise<void> {
  release.resolve()
  return hold
}

async function insertQueuedMembershipGrantOn(
  query: QueryExecutor,
  input: QueuedMembershipGrantInput,
): Promise<string> {
  const durationDays = input.durationDays ?? 30
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3660)
    throw new RangeError('Admin grants require durationDays between 1 and 3660')
  const { rows } = await query<{ id: string }>(sql`/* insertQueuedMembershipGrant */
    WITH source AS (
      INSERT INTO membership_sources (user_id, source_kind)
      VALUES (${input.userId}, 'admin_grant')
      RETURNING id, user_id
    ), grant_row AS (
      INSERT INTO membership_grants (
        membership_source_id, user_id, membership_product_id, calendar_days,
        granted_by_id, issuer_snapshot
      )
      SELECT id, user_id, ${input.productId}, ${durationDays}, ${input.grantedById}, 'Test issuer'
      FROM source
      RETURNING id, membership_source_id
    ), state AS (
      INSERT INTO membership_source_states (
        membership_source_id, source_kind, membership_product_id, effective_at, should_auto_renew
      )
      SELECT membership_source_id, 'admin_grant', ${input.productId}, CURRENT_TIMESTAMP, false
      FROM grant_row
      RETURNING membership_source_id
    )
    SELECT grant_row.id FROM grant_row INNER JOIN state ON true`)
  const grantId = rows[0]?.id
  if (!grantId) throw new Error('Queued membership grant was not inserted')
  return grantId
}
