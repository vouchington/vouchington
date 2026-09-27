import { beginTransaction, type OwnedTransaction } from '@data-stores/psql'
import { retainPublicationIdentityBridges } from '@services/post-publication/identity-bridges'
import { lockPostPublication } from '@services/post-publication'
import { reserveClassifierDecisionBatch } from '@services/classifiers/write-decision-lineage'
import sql from 'sql-template-strings'
import { resolvePostClassifierConfiguration } from './configuration.mts'

export type ReservedPostClassifierApplication = {
  applicationId: string
  postId: string
  inputSha256: Buffer
  configurationSha256: Buffer
  detectorPackageVersion: string
  decisionBatchId: string | null
}

type LockedPostClassifierPost = {
  input_sha256: Buffer
  community_id: string | null
  approved_at: Date | null
}

/**
 * Persists the classifier intent before its child job is enqueued. The receipt snapshot is the
 * only configuration a later worker may claim; it never recreates work for a different revision.
 */
export async function reservePostClassifierApplication(
  postId: string,
  detectorPackageVersion: string,
): Promise<ReservedPostClassifierApplication | null> {
  if (!detectorPackageVersion) throw new Error('Detector package version is required')
  await using query = await beginTransaction()
  await lockPostPublication(query, postId)
  const post = await lockPostClassifierPost(query, postId)
  if (!post || post.approved_at === null) return null
  const reservation = await reserveLockedPostClassifierApplication(
    query,
    postId,
    post,
    detectorPackageVersion,
  )
  await query.commit()
  return reservation
}

export async function lockPostClassifierPost(
  query: OwnedTransaction,
  postId: string,
): Promise<LockedPostClassifierPost | null> {
  const { rows } =
    await query<LockedPostClassifierPost>(sql`/* reservePostClassifierApplication.post */
    SELECT llm_moderation_content_sha256 AS input_sha256, community_id, approved_at
    FROM posts
    WHERE id = ${postId} AND deleted_at IS NULL
    FOR UPDATE
  `)
  return rows[0] ?? null
}

export async function reserveLockedPostClassifierApplication(
  query: OwnedTransaction,
  postId: string,
  post: LockedPostClassifierPost,
  detectorPackageVersion: string,
  lease?: { token: string; seconds: number },
): Promise<ReservedPostClassifierApplication | null> {
  const resolved = await resolvePostClassifierConfiguration(post.community_id, {
    detectorPackageVersion,
    query,
  })
  if (!resolved) return null
  if (post.community_id) {
    await retainPublicationIdentityBridges(query, 'community', [post.community_id])
  }
  const proposedDecisionBatchId = resolved.configuration.remote
    ? await createPostClassifierDecisionBatchId(query)
    : null
  const { rows: inserted } = await query<{ id: string; decision_batch_id: string | null }>(sql`
    /* reservePostClassifierApplication.insert */
    INSERT INTO post_classifier_applications (
      post_id, input_sha256, configuration_json, configuration_sha256, shared_actor_id,
      community_identity_id, detector_package_version, local_topic_id, decision_batch_id,
      lease_token, leased_at, lease_expires_at
    ) VALUES (
      ${postId}, ${post.input_sha256}, ${resolved.configurationJson}::json,
      ${resolved.configurationSha256}, ${resolved.configuration.actorId},
      ${post.community_id}, ${detectorPackageVersion}, ${resolved.configuration.local?.topicId ?? null},
      ${proposedDecisionBatchId}, ${lease?.token ?? null}::uuid,
      CASE WHEN ${lease?.token ?? null}::uuid IS NULL THEN NULL ELSE clock_timestamp() END,
      CASE WHEN ${lease?.token ?? null}::uuid IS NULL THEN NULL
        ELSE clock_timestamp() + ${lease?.seconds ?? 0}::integer * INTERVAL '1 second' END
    ) ON CONFLICT (post_id, input_sha256, configuration_sha256)
    DO UPDATE SET post_id = EXCLUDED.post_id, superseded_at = NULL
    RETURNING id, decision_batch_id
  `)
  const application = inserted[0]
  if (!application)
    throw new Error('post classifier application reservation did not return a receipt')
  if (application.decision_batch_id === proposedDecisionBatchId && proposedDecisionBatchId) {
    const remote = resolved.configuration.remote
    if (!remote) throw new Error('Local-only classifier application reserved a decision batch')
    const reserved = await reserveClassifierDecisionBatch(query, {
      batchId: proposedDecisionBatchId,
      classifierId: remote.classifierId,
      promptVersionId: remote.promptVersionId,
      subject: { postId, rssFeedItemId: null },
      scope: { scopeCategory: 'global', scopeCommunityId: null },
      candidateKind: 'topic',
      storedCandidateIds: remote.questions.map(question => question.candidateId),
    })
    if (!reserved) throw new Error('post classifier decision batch reservation was not inserted')
  }
  return {
    applicationId: application.id,
    postId,
    inputSha256: post.input_sha256,
    configurationSha256: resolved.configurationSha256,
    detectorPackageVersion,
    decisionBatchId: application.decision_batch_id,
  }
}

async function createPostClassifierDecisionBatchId(query: OwnedTransaction): Promise<string> {
  const { rows } = await query<{ id: string }>(sql`
    /* createPostClassifierDecisionBatchId */
    SELECT uuidv7() AS id
  `)
  const id = rows[0]?.id
  if (!id) throw new Error('post classifier decision batch ID was not generated')
  return id
}
