import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
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
  const { rows: inserted } = await query<{ id: string; reserved_batch_id: string | null }>(sql`
    /* claimPostClassifierApplication.insert */
    INSERT INTO post_classifier_applications (
      post_id, input_sha256, configuration_json, configuration_sha256, shared_actor_id,
      reserved_batch_id, lease_token, leased_at, lease_expires_at
    ) VALUES (
      ${input.postId}, ${input.inputSha256}, ${input.resolved.configurationJson},
      ${input.resolved.configurationSha256}, ${input.resolved.configuration.actorId},
      CASE WHEN ${input.resolved.configuration.remote !== null} THEN uuidv7() ELSE NULL END,
      ${leaseToken}, clock_timestamp(),
      clock_timestamp() + ${input.leaseSeconds} * INTERVAL '1 second'
    ) ON CONFLICT (post_id, input_sha256, configuration_sha256) DO NOTHING
    RETURNING id, reserved_batch_id
  `)
  const created = inserted[0]
  if (created) {
    if (input.applicationId && created.id !== input.applicationId) return { kind: 'stale' }
    await query.commit()
    return {
      kind: 'claimed',
      ...input,
      applicationId: created.id,
      reservedBatchId: created.reserved_batch_id,
      leaseToken,
    }
  }
  const existing = await lockPostClassifierApplication(query, input)
  if (!existing) throw new Error('post classifier application disappeared during claim')
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
    reservedBatchId: existing.reserved_batch_id,
    leaseToken,
  }
}
