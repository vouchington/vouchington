import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  lockPostClassifierPost,
  reserveLockedPostClassifierApplication,
} from './application-reservation.mts'
import {
  lockCurrentPostClassifierApplicationInput,
  lockPostClassifierApplication,
  type PostClassifierApplicationIdentity,
  type PostClassifierApplicationLease,
} from './application-identity.mts'

export type ClaimPostClassifierApplicationInput = PostClassifierApplicationIdentity & {
  applicationId?: string
  leaseSeconds: number
}

export type ClaimPostClassifierApplicationResult =
  | (PostClassifierApplicationLease & { kind: 'claimed' | 'outcomes_ready' })
  | { kind: 'in_progress'; retryAfterSeconds: number }
  | { kind: 'completed' | 'terminal' | 'stale' }

export async function claimPostClassifierApplication(
  input: ClaimPostClassifierApplicationInput,
): Promise<ClaimPostClassifierApplicationResult> {
  if (!Number.isInteger(input.leaseSeconds) || input.leaseSeconds <= 0) {
    throw new Error('post classifier lease duration must be a positive integer')
  }
  await using query = await beginTransaction()
  if (!(await lockCurrentPostClassifierApplicationInput(query, input))) {
    return { kind: 'stale' }
  }
  const leaseToken = randomUUID()
  const post = await lockPostClassifierPost(query, input.postId)
  if (!post) return { kind: 'stale' }
  const reserved = await reserveLockedPostClassifierApplication(
    query,
    input.postId,
    post,
    input.detectorPackageVersion,
    { token: leaseToken, seconds: input.leaseSeconds },
  )
  if (!reserved) return { kind: 'stale' }
  const created = await lockPostClassifierApplication(query, input)
  if (!created) throw new Error('post classifier application disappeared during claim')
  if (created.lease_token === leaseToken) {
    if (input.applicationId && created.id !== input.applicationId) return { kind: 'stale' }
    await query.commit()
    return {
      kind: 'claimed',
      ...input,
      applicationId: created.id,
      decisionBatchId: created.decision_batch_id,
      leaseToken,
    }
  }
  const existing = created
  if (input.applicationId && existing.id !== input.applicationId) return { kind: 'stale' }
  if (existing.superseded_at) return { kind: 'stale' }
  if (existing.completed_at) return { kind: 'completed' }
  if (existing.terminal_remote_failed_at) return { kind: 'terminal' }
  if (existing.lease_is_live) {
    return { kind: 'in_progress', retryAfterSeconds: existing.retry_after_seconds ?? 1 }
  }
  await query(sql`/* claimPostClassifierApplication.reclaim */
    UPDATE post_classifier_applications
    SET lease_token = ${leaseToken}, leased_at = clock_timestamp(),
      lease_expires_at = clock_timestamp() + ${input.leaseSeconds} * INTERVAL '1 second'
    WHERE post_id = ${input.postId} AND id = ${existing.id}
  `)
  await query.commit()
  return {
    kind: existing.outcomes_persisted_at ? 'outcomes_ready' : 'claimed',
    ...input,
    applicationId: existing.id,
    decisionBatchId: existing.decision_batch_id,
    leaseToken,
  }
}
