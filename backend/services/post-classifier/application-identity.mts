import type { OwnedTransaction } from '@data-stores/psql'
import { lockPostPublication } from '@services/post-publication'
import sql from 'sql-template-strings'
import { resolvePostClassifierConfiguration } from './configuration.mts'

export type ResolvedPostClassifierConfiguration = NonNullable<
  Awaited<ReturnType<typeof resolvePostClassifierConfiguration>>
>

export type PostClassifierApplicationIdentity = {
  postId: string
  inputSha256: Buffer
  resolved: ResolvedPostClassifierConfiguration
  detectorPackageVersion: string
}

export type PostClassifierApplicationLease = PostClassifierApplicationIdentity & {
  applicationId: string
  leaseToken: string
  decisionBatchId: string | null
}

export type PostClassifierApplicationRow = {
  id: string
  input_sha256: Buffer
  configuration_json: string
  configuration_sha256: Buffer
  shared_actor_id: string
  detector_package_version: string
  local_topic_id: string | null
  decision_batch_id: string | null
  provider_attempts_started: number
  terminal_remote_failed_at: Date | null
  superseded_at: Date | null
  lease_token: string | null
  lease_is_live: boolean
  retry_after_seconds: number | null
  outcomes_persisted_at: Date | null
  votes_applied_at: Date | null
  tags_applied_at: Date | null
  completed_at: Date | null
}

export async function lockCurrentPostClassifierApplicationInput(
  query: OwnedTransaction,
  identity: PostClassifierApplicationIdentity,
): Promise<boolean> {
  await lockPostPublication(query, identity.postId)
  const { rows } = await query<{
    llm_moderation_content_sha256: Buffer
    community_id: string | null
    approved_at: Date | null
  }>(sql`/* lockCurrentPostClassifierApplicationPost */
    SELECT llm_moderation_content_sha256, community_id, approved_at FROM posts
    WHERE id = ${identity.postId} AND deleted_at IS NULL FOR UPDATE
  `)
  const post = rows[0]
  if (
    !post ||
    post.approved_at === null ||
    !post.llm_moderation_content_sha256.equals(identity.inputSha256)
  ) {
    return false
  }
  await query(sql`/* lockPostClassifierApplicationActor */
    SELECT fn_lock_active_user_for_mutation(${identity.resolved.configuration.actorId}::uuid)
  `)
  const current = await resolvePostClassifierConfiguration(post.community_id, {
    detectorPackageVersion: identity.detectorPackageVersion,
    query,
  })
  return (
    current !== null &&
    current.configurationSha256.equals(identity.resolved.configurationSha256) &&
    current.configurationJson === identity.resolved.configurationJson
  )
}

export async function lockPostClassifierApplication(
  query: OwnedTransaction,
  identity: PostClassifierApplicationIdentity,
): Promise<PostClassifierApplicationRow | null> {
  const { rows } = await query<PostClassifierApplicationRow>(sql`
    /* lockPostClassifierApplication */
    SELECT id, input_sha256, configuration_json::text AS configuration_json, configuration_sha256, shared_actor_id,
      detector_package_version, local_topic_id,
      decision_batch_id, provider_attempts_started,
      terminal_remote_failed_at, superseded_at, lease_token, outcomes_persisted_at, votes_applied_at,
      tags_applied_at, completed_at,
      (lease_token IS NOT NULL AND lease_expires_at > clock_timestamp()) AS lease_is_live,
      CASE WHEN lease_token IS NOT NULL AND lease_expires_at > clock_timestamp()
        THEN GREATEST(1, CEIL(EXTRACT(EPOCH FROM lease_expires_at - clock_timestamp())))::int
        ELSE NULL END AS retry_after_seconds
    FROM post_classifier_applications
    WHERE post_id = ${identity.postId} AND input_sha256 = ${identity.inputSha256}
      AND configuration_sha256 = ${identity.resolved.configurationSha256}
    FOR UPDATE
  `)
  const row = rows[0]
  if (!row) return null
  if (
    row.configuration_json !== identity.resolved.configurationJson ||
    !row.input_sha256.equals(identity.inputSha256) ||
    !row.configuration_sha256.equals(identity.resolved.configurationSha256) ||
    row.shared_actor_id !== identity.resolved.configuration.actorId ||
    row.detector_package_version !== identity.detectorPackageVersion ||
    row.local_topic_id !== (identity.resolved.configuration.local?.topicId ?? null) ||
    (row.decision_batch_id === null) !== (identity.resolved.configuration.remote === null)
  ) {
    throw new Error('post classifier application identity does not match its snapshot')
  }
  return row
}

export function applicationLeaseMatches(
  row: PostClassifierApplicationRow | null,
  lease: PostClassifierApplicationLease,
): row is PostClassifierApplicationRow {
  return (
    row !== null &&
    row.id === lease.applicationId &&
    row.lease_token === lease.leaseToken &&
    row.lease_is_live &&
    row.decision_batch_id === lease.decisionBatchId &&
    row.completed_at === null &&
    row.terminal_remote_failed_at === null
  )
}
