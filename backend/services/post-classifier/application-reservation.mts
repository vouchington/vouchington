import { beginTransaction, type OwnedTransaction } from '@data-stores/psql'
import { lockPostPublication } from '@services/post-publication'
import sql from 'sql-template-strings'
import { resolvePostClassifierConfiguration } from './configuration.mts'

export type ReservedPostClassifierApplication = {
  applicationId: string
  postId: string
  inputSha256: Buffer
  configurationSha256: Buffer
  detectorPackageVersion: string
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
): Promise<ReservedPostClassifierApplication | null> {
  const resolved = await resolvePostClassifierConfiguration(post.community_id, {
    detectorPackageVersion,
    query,
  })
  if (!resolved) return null
  const { rows: inserted } = await query<{ id: string }>(sql`
    /* reservePostClassifierApplication.insert */
    INSERT INTO post_classifier_applications (
      post_id, input_sha256, configuration_json, configuration_sha256, shared_actor_id,
      reserved_batch_id
    ) VALUES (
      ${postId}, ${post.input_sha256}, ${resolved.configurationJson},
      ${resolved.configurationSha256}, ${resolved.configuration.actorId},
      CASE WHEN ${resolved.configuration.remote !== null} THEN uuidv7() ELSE NULL END
    ) ON CONFLICT (post_id, input_sha256, configuration_sha256)
    DO UPDATE SET post_id = EXCLUDED.post_id, superseded_at = NULL
    RETURNING id
  `)
  const applicationId = inserted[0]?.id
  if (!applicationId)
    throw new Error('post classifier application reservation did not return a receipt')
  return {
    applicationId,
    postId,
    inputSha256: post.input_sha256,
    configurationSha256: resolved.configurationSha256,
    detectorPackageVersion,
  }
}
