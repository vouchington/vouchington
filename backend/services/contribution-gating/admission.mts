import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { normalizeContributionAdmissionAudit } from './admission-audit.mts'
import {
  LostContributionAdmissionLeaseError,
  RejectedContributionAdmissionPreconditionError,
  isTerminalContributionAdmissionMutationError,
} from './admission-errors.mts'
import { recordContributionAdmissionConsumption } from './admission-quota.mts'
import {
  assertContributionAdmissionCapacityOrReject,
  RejectedContributionAdmissionCapacityError,
} from './admission-capacity-rejection.mts'
import { startAdmissionLeaseKeeper } from './admission-lease-keeper.mts'
import { renewContributionAdmissionLease } from './admission-lease-renewal.mts'
import { renewContributionAdmissionLeaseFromWritePool } from './admission-lease-renewal-write-pool.mts'
import {
  claimContributionAdmission,
  markContributionAdmissionRetryableFailure,
} from './admission-reservations.mts'
import { contributionAdmissionConsumptionMode } from './policy.mts'
import type { ContributionAdmissionInput, ContributionAdmissionResult } from './admission-types.mts'
import { publishFinalizedContributionResponse } from './publish-finalized-response.mts'
import {
  committedContributionPostId,
  getCommittedContributionAdmissionResponse,
  isContributionAdmissionCommitted,
} from './admission-response.mts'
import { cleanupRejectedContributionAdmission } from './admission-rejection-cleanup.mts'
import { CONTRIBUTION_ADMISSION_REPLAY_RETENTION_MINUTES } from './admission-replay-retention.mts'

export { canonicalizeAdmissionIntent, hashAdmissionIntent } from './admission-intent.mts'
export { resolveAdmissionIdentity } from './admission-intent.mts'
export { pruneExpiredContributionAdmissions } from './admission-reservations.mts'
export type { ContributionAdmissionAudit } from './admission-reservations.mts'
export type { ContributionAdmissionInput, ContributionAdmissionResult } from './admission-types.mts'

/** Claims before mutation; the mutation, quota, and replay response commit atomically. */
export async function runContributionAdmission<T>(
  input: ContributionAdmissionInput<T>,
): Promise<ContributionAdmissionResult<T>> {
  const audit = normalizeContributionAdmissionAudit(input)
  const claim = await claimContributionAdmission<T>(
    input.actorId,
    input.idempotencyKey,
    input.intent,
    audit,
  )
  if (claim.kind !== 'claimed') return claim
  const leaseKeeper = startAdmissionLeaseKeeper(() =>
    renewContributionAdmissionLeaseFromWritePool(claim.reservationId, claim.leaseId),
  )
  let committedResult: { kind: 'created'; response: T } | undefined
  let commitMayHaveSucceeded = false
  const cleanupRejectedAdmission = () =>
    cleanupRejectedContributionAdmission(claim.reservationId, claim.leaseId)
  try {
    if (!(await leaseKeeper.ensureOwned())) return { kind: 'in_progress', retryAfterSeconds: 1 }
    try {
      await input.beforeCapacity?.()
    } catch (error) {
      throw new RejectedContributionAdmissionPreconditionError(error)
    }
    if (!(await renewContributionAdmissionLeaseFromWritePool(claim.reservationId, claim.leaseId)))
      return { kind: 'in_progress', retryAfterSeconds: 1 }
    if (input.policy && input.source && !input.capacityExempt) {
      const { policy, source } = input
      await using query = await beginTransaction()
      await assertContributionAdmissionCapacityOrReject(query, input.actorId, source, policy)
      await query.commit()
    }
    try {
      await input.beforeCommit?.()
    } catch (error) {
      throw new RejectedContributionAdmissionPreconditionError(error)
    }
    await using query = await beginTransaction()
    const response = await input.execute(query)
    const reservation = await query(sql`/* runContributionAdmission.lockReservation */
      SELECT id FROM post_admission_reservations
      WHERE id = ${claim.reservationId} FOR UPDATE`)
    if (reservation.rowCount !== 1) throw new LostContributionAdmissionLeaseError()
    await query(sql`/* runContributionAdmission.lockActor */
    SELECT id FROM users WHERE id = ${input.actorId} FOR NO KEY UPDATE`)
    if (input.policy && input.source && !input.capacityExempt)
      await assertContributionAdmissionCapacityOrReject(
        query,
        input.actorId,
        input.source,
        input.policy,
      )
    const committedAt = await renewContributionAdmissionLease(
      query,
      claim.reservationId,
      claim.leaseId,
    )
    if (!committedAt) throw new LostContributionAdmissionLeaseError()
    if (input.policy && input.source && !input.capacityExempt)
      await recordContributionAdmissionConsumption(
        query,
        claim.reservationId,
        input.actorId,
        input.source,
        committedAt,
        contributionAdmissionConsumptionMode(input.policy),
      )
    await query(sql`/* runContributionAdmission.commit */
      WITH terminal AS (
        SELECT ${committedAt}::timestamptz AS committed_at
      )
      UPDATE post_admission_reservations r SET state = 'committed', response = ${JSON.stringify(response)}::jsonb,
        replay_metadata = ${JSON.stringify({ route: audit.route, scope: audit.scope, finalization: 'pending' })}::jsonb,
        committed_post_id = ${committedContributionPostId(response)}, committed_status = 'created',
        committed_at = terminal.committed_at,
        expires_at = terminal.committed_at + ${CONTRIBUTION_ADMISSION_REPLAY_RETENTION_MINUTES} * INTERVAL '1 minute',
        retention_expires_at = terminal.committed_at + ${CONTRIBUTION_ADMISSION_REPLAY_RETENTION_MINUTES} * INTERVAL '1 minute',
        updated_at = terminal.committed_at
      FROM terminal
      WHERE r.id = ${claim.reservationId}`)
    commitMayHaveSucceeded = true
    const result = { kind: 'created', response } as const

    await query.commit()
    if (result.kind === 'created') {
      committedResult = result
      const published = await publishFinalizedContributionResponse<T>({
        reservationId: claim.reservationId,
        leaseId: claim.leaseId,
      })
      if (published.kind !== 'published') {
        if (input.callerCanReplayIdempotencyIdentity === false)
          return {
            kind: 'created',
            response: await getCommittedContributionAdmissionResponse<T>(claim.reservationId),
          }
        return { kind: 'in_progress', retryAfterSeconds: 1 }
      }
      return { kind: 'created', response: published.response }
    }
    return result
  } catch (error) {
    if (committedResult)
      return input.callerCanReplayIdempotencyIdentity === false
        ? committedResult
        : { kind: 'in_progress', retryAfterSeconds: 1 }
    if (commitMayHaveSucceeded && (await isContributionAdmissionCommitted(claim.reservationId))) {
      if (input.callerCanReplayIdempotencyIdentity === false)
        return {
          kind: 'created',
          response: await getCommittedContributionAdmissionResponse<T>(claim.reservationId),
        }
      return { kind: 'in_progress', retryAfterSeconds: 1 }
    }
    if (error instanceof LostContributionAdmissionLeaseError) {
      return { kind: 'in_progress', retryAfterSeconds: 1 }
    }
    if (error instanceof RejectedContributionAdmissionPreconditionError) {
      await leaseKeeper.stop()
      await cleanupRejectedAdmission()
      throw error.reason
    }
    if (error instanceof RejectedContributionAdmissionCapacityError) {
      await cleanupRejectedAdmission()
      throw error.reason
    }
    if (isTerminalContributionAdmissionMutationError(error)) {
      await cleanupRejectedAdmission()
      throw error
    }
    await markContributionAdmissionRetryableFailure(claim.reservationId, claim.leaseId, error)
    throw error
  } finally {
    await leaseKeeper.stop()
  }
}
