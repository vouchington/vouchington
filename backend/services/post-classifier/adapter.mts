import type { OwnedTransaction } from '@data-stores/psql'
import type { ClassifierRunAdapter, ClassifierRunSubject } from '@services/classifier-runs'
import { lockPostPublication } from '@services/post-publication'
import { POST_CLASSIFIER_SLUG } from '@voucha/types/entities/post-classifier'
import sql from 'sql-template-strings'
import { resolvePostClassifierConfiguration } from './configuration.mts'
import { applyPostClassifierEffects, type PostClassifierEffects } from './effects.mts'
import {
  persistPostClassifierLocalOutcome,
  readPostClassifierLocalOutcome,
  validatePostClassifierLocal,
  type PostClassifierLocalOutcome,
} from './local-outcome.mts'
import { toResolvedClassifierRun, type PostClassifierConfiguration } from './run-configuration.mts'

export type PostClassifierRunAdapter = ClassifierRunAdapter<
  PostClassifierConfiguration,
  PostClassifierLocalOutcome,
  PostClassifierEffects
>

function postIdOf(subject: ClassifierRunSubject): string {
  if (subject.postId === null) throw new Error('post classifier subject must be a post')
  return subject.postId
}

/**
 * The C5 adapter: how an approved post's current input is read and its configuration resolved, plus
 * how the durable outcomes become topic votes and tags. The shared classifier-run lifecycle owns
 * receipt, lease, attempts, terminal failure, completion, supersession and sweep.
 */
export function createPostClassifierRunAdapter(
  detectorPackageVersion: string,
): PostClassifierRunAdapter {
  if (!detectorPackageVersion) throw new Error('Detector package version is required')
  return {
    slug: POST_CLASSIFIER_SLUG,
    async lockCurrent(query: OwnedTransaction, subject) {
      const postId = postIdOf(subject)
      await lockPostPublication(query, postId)
      const { rows } = await query<{ input_sha256: Buffer; community_id: string | null }>(sql`
        /* lockCurrentPostClassifierInput */
        SELECT llm_moderation_content_sha256 AS input_sha256, community_id FROM posts
        WHERE id = ${postId} AND deleted_at IS NULL AND approved_at IS NOT NULL FOR UPDATE
      `)
      const post = rows[0]
      return post ? { inputSha256: post.input_sha256, communityId: post.community_id } : null
    },
    async resolve(current, query) {
      const resolved = await resolvePostClassifierConfiguration(current.communityId, {
        detectorPackageVersion,
        query,
      })
      return resolved && toResolvedClassifierRun(resolved)
    },
    requestEligibility: () => sql`EXISTS (
      SELECT 1 FROM posts post
      WHERE post.id = request.post_id AND post.deleted_at IS NULL AND post.approved_at IS NOT NULL
        AND post.llm_moderation_content_sha256 = request.input_sha256
    )`,
    validateLocal: validatePostClassifierLocal,
    persistLocal: persistPostClassifierLocalOutcome,
    readLocal: readPostClassifierLocalOutcome,
    applyEffects: applyPostClassifierEffects,
  }
}
