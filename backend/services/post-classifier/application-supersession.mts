import { beginTransaction } from '@data-stores/psql'
import { lockPostPublication } from '@services/post-publication'
import sql from 'sql-template-strings'
import {
  lockPostClassifierPost,
  reserveLockedPostClassifierApplication,
  type ReservedPostClassifierApplication,
} from './application-reservation.mts'
import { resolvePostClassifierConfiguration } from './configuration.mts'

export type StalePostClassifierApplication = {
  applicationId: string
  postId: string
  inputSha256: Buffer
  configurationSha256: Buffer
  detectorPackageVersion: string
}

/**
 * Stops recovery of a queued receipt that no longer matches an approved post revision or current
 * classifier configuration. When current work remains configured, its new receipt is reserved in
 * the same transaction so a crash cannot strand the post on the obsolete fingerprint.
 */
export async function supersedeStalePostClassifierApplication(
  stale: StalePostClassifierApplication,
): Promise<ReservedPostClassifierApplication | null> {
  await using query = await beginTransaction()
  await lockPostPublication(query, stale.postId)
  const post = await lockPostClassifierPost(query, stale.postId)
  const { rows: applications } = await query<{ superseded_at: Date | null }>(sql`
    /* supersedeStalePostClassifierApplication.application */
    SELECT superseded_at
    FROM post_classifier_applications
    WHERE post_id = ${stale.postId} AND id = ${stale.applicationId}
      AND input_sha256 = ${stale.inputSha256}
      AND configuration_sha256 = ${stale.configurationSha256}
    FOR UPDATE
  `)
  const application = applications[0]
  if (!application || application.superseded_at !== null) return null

  const current = post
    ? await resolvePostClassifierConfiguration(post.community_id, {
        detectorPackageVersion: stale.detectorPackageVersion,
        query,
      })
    : null
  if (
    post?.approved_at !== null &&
    post?.approved_at !== undefined &&
    post.input_sha256.equals(stale.inputSha256) &&
    current?.configurationSha256.equals(stale.configurationSha256)
  ) {
    return null
  }

  await query(sql`/* supersedeStalePostClassifierApplication.mark */
    UPDATE post_classifier_applications
    SET superseded_at = clock_timestamp(),
      lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
    WHERE post_id = ${stale.postId} AND id = ${stale.applicationId}
  `)
  const replacement =
    post && post.approved_at !== null && current
      ? await reserveLockedPostClassifierApplication(
          query,
          stale.postId,
          post,
          stale.detectorPackageVersion,
        )
      : null
  await query.commit()
  return replacement
}
