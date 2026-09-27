import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  applicationLeaseMatches,
  lockCurrentPostClassifierApplicationInput,
  lockPostClassifierApplication,
  type PostClassifierApplicationLease,
} from './application-identity.mts'

export type PostClassifierRemoteFailureKind =
  | 'provider-error'
  | 'invalid-result'
  | 'context-rejected'

/** Releases a live receipt lease before this lease dispatches a provider request. */
export async function releasePostClassifierAdmissionLease(
  input: PostClassifierApplicationLease,
): Promise<'released' | 'stale'> {
  await using query = await beginTransaction()
  if (!(await lockCurrentPostClassifierApplicationInput(query, input))) return 'stale'
  const row = await lockPostClassifierApplication(query, input)
  if (!applicationLeaseMatches(row, input) || row.outcomes_persisted_at) return 'stale'
  await query(sql`/* releasePostClassifierAdmissionLease */
    UPDATE post_classifier_applications
    SET lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
    WHERE post_id = ${input.postId} AND id = ${input.applicationId}
  `)
  await query.commit()
  return 'released'
}

export async function startPostClassifierProviderAttempt(
  input: PostClassifierApplicationLease & { maxAttempts: number },
): Promise<'started' | 'stale' | 'replay' | 'terminal' | 'no_remote'> {
  if (!Number.isInteger(input.maxAttempts) || input.maxAttempts <= 0) {
    throw new Error('post classifier provider attempt limit must be positive')
  }
  await using query = await beginTransaction()
  if (!(await lockCurrentPostClassifierApplicationInput(query, input))) return 'stale'
  const row = await lockPostClassifierApplication(query, input)
  if (!applicationLeaseMatches(row, input)) return 'stale'
  if (row.outcomes_persisted_at) return 'replay'
  if (row.decision_batch_id === null) return 'no_remote'
  if (row.provider_attempts_started >= input.maxAttempts) {
    await query(sql`/* startPostClassifierProviderAttempt.exhausted */
      UPDATE post_classifier_applications
      SET terminal_remote_failure_kind = 'attempts-exhausted',
        terminal_remote_failed_at = clock_timestamp(),
        lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
      WHERE post_id = ${input.postId} AND id = ${input.applicationId}
    `)
    await query.commit()
    return 'terminal'
  }
  await query(sql`/* startPostClassifierProviderAttempt */
    UPDATE post_classifier_applications
    SET provider_attempts_started = provider_attempts_started + 1
    WHERE post_id = ${input.postId} AND id = ${input.applicationId}
  `)
  await query.commit()
  return 'started'
}

export async function failPostClassifierRemoteAttempt(
  input: PostClassifierApplicationLease & {
    maxAttempts: number
    failureKind: PostClassifierRemoteFailureKind
  },
): Promise<'released' | 'terminal' | 'stale'> {
  if (!Number.isInteger(input.maxAttempts) || input.maxAttempts <= 0) {
    throw new Error('post classifier provider attempt limit must be positive')
  }
  await using query = await beginTransaction()
  if (!(await lockCurrentPostClassifierApplicationInput(query, input))) return 'stale'
  const row = await lockPostClassifierApplication(query, input)
  if (!applicationLeaseMatches(row, input) || row.outcomes_persisted_at) return 'stale'
  const terminal = row.provider_attempts_started >= input.maxAttempts
  await query(sql`/* failPostClassifierRemoteAttempt */
    UPDATE post_classifier_applications
    SET terminal_remote_failure_kind = CASE WHEN ${terminal} THEN ${input.failureKind} ELSE NULL END,
      terminal_remote_failed_at = CASE WHEN ${terminal} THEN clock_timestamp() ELSE NULL END,
      lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
    WHERE post_id = ${input.postId} AND id = ${input.applicationId}
  `)
  await query.commit()
  return terminal ? 'terminal' : 'released'
}
