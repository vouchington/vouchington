import { beginTransaction, write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { MembershipRefundRequestConflictError } from './refund-errors.mts'

type MembershipRefundIntentIdentity = {
  membershipId: string
  membershipSourceId: string
  issuedById: string
  stripeIdempotencyKey: string
  requestFingerprint: string
}

type MembershipRefundIntentRequestIdentity = Omit<
  MembershipRefundIntentIdentity,
  'membershipSourceId'
> & {
  membershipSourceId?: string
}

type MembershipRefundIntentRow = {
  membership_id: string
  membership_source_id: string
  issued_by_id: string
  request_fingerprint: string
}

type MembershipRefundIntentReplayRow = MembershipRefundIntentRow & {
  replay_state: 'retryable' | 'outcome_unknown'
}

export type MembershipRefundIntent = {
  membershipId: string
  membershipSourceId: string
  issuedById: string
  requestFingerprint: string
  replayState: 'retryable' | 'outcome_unknown'
}

export async function claimMembershipRefundIntent(
  options: MembershipRefundIntentIdentity,
): Promise<void> {
  await using query = await beginTransaction()
  await query(sql`/* claimMembershipRefundIntent:insert */
      INSERT INTO membership_refund_intents (
        membership_id, membership_source_id, issued_by_id, stripe_idempotency_key,
        request_fingerprint
      )
      VALUES (
        ${options.membershipId}, ${options.membershipSourceId}, ${options.issuedById},
        ${options.stripeIdempotencyKey}, ${options.requestFingerprint}
      )
      ON CONFLICT (stripe_idempotency_key) DO NOTHING
  `)
  await assertMembershipRefundIntent(options, query)
  await query.commit()
}

export async function getMembershipRefundIntentByStripeIdempotencyKey(
  stripeIdempotencyKey: string,
): Promise<MembershipRefundIntent | null> {
  const { rows } = await write(sql`/* getMembershipRefundIntentByStripeIdempotencyKey */
    SELECT membership_id, membership_source_id, issued_by_id, request_fingerprint,
      CASE
        WHEN created_at <= statement_timestamp() - INTERVAL '23 hours'
          THEN 'outcome_unknown'
        ELSE 'retryable'
      END AS replay_state
    FROM membership_refund_intents
    WHERE stripe_idempotency_key = ${stripeIdempotencyKey}
  `)
  const row = rows[0] as MembershipRefundIntentReplayRow | undefined
  if (!row) return null
  return {
    membershipId: row.membership_id,
    membershipSourceId: row.membership_source_id,
    issuedById: row.issued_by_id,
    requestFingerprint: row.request_fingerprint,
    replayState: row.replay_state,
  }
}

export async function assertMembershipRefundIntent(
  options: MembershipRefundIntentRequestIdentity,
  query: QueryExecutor,
): Promise<void> {
  const { rows } = await query(sql`/* assertMembershipRefundIntent */
    SELECT membership_id, membership_source_id, issued_by_id, request_fingerprint
    FROM membership_refund_intents
    WHERE stripe_idempotency_key = ${options.stripeIdempotencyKey}
    FOR SHARE
  `)
  const row = rows[0] as MembershipRefundIntentRow | undefined
  if (!row) throw new MembershipRefundRequestConflictError()
  const intent = {
    membershipId: row.membership_id,
    membershipSourceId: row.membership_source_id,
    issuedById: row.issued_by_id,
    requestFingerprint: row.request_fingerprint,
  }
  assertMembershipRefundIntentMatches(options, intent)
}

function assertMembershipRefundIntentMatches(
  options: MembershipRefundIntentRequestIdentity,
  intent: Pick<
    MembershipRefundIntent,
    'membershipId' | 'membershipSourceId' | 'issuedById' | 'requestFingerprint'
  >,
): void {
  if (
    intent.membershipId !== options.membershipId ||
    (options.membershipSourceId !== undefined &&
      intent.membershipSourceId !== options.membershipSourceId) ||
    intent.issuedById !== options.issuedById ||
    intent.requestFingerprint !== options.requestFingerprint
  ) {
    throw new MembershipRefundRequestConflictError()
  }
}
