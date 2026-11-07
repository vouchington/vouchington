import sql from 'sql-template-strings'
import { recordModeratorAction } from '@services/moderator-actions'
import { recordPostPublicationChange } from '@services/post-publication'
import { getAutomodFeedbackContext } from './automod-feedback-context.mts'
import { parseAutomodActionSourceKey } from './recent-actions.mts'
import type { RecordAutomodActionFeedbackInput } from './automod-feedback-input.mts'

type AutomodFeedbackContext = NonNullable<Awaited<ReturnType<typeof getAutomodFeedbackContext>>>
type ParsedAutomodSource = NonNullable<ReturnType<typeof parseAutomodActionSourceKey>>
type FeedbackQuery = Parameters<typeof recordPostPublicationChange>[0]

export async function applyAutomodKeepRemoved(
  query: FeedbackQuery,
  input: RecordAutomodActionFeedbackInput,
  context: AutomodFeedbackContext,
  _parsed: ParsedAutomodSource,
): Promise<void> {
  const rejectResult = await query(sql`/* recordAutomodActionFeedback:rejectInReviewPost */
        WITH inserted_change AS (
          INSERT INTO post_clearance_changes (
            post_id,
            change_type,
            changed_by_id,
            metadata,
            moderation_transparency_categories
          )
          SELECT
            ${context.post_id},
            'reject',
            ${input.actorUserId},
            ${JSON.stringify({ source_key: input.sourceKey, moderation_training: true })}::jsonb,
            COALESCE((
              SELECT array_agg(latest.source::text::moderation_transparency_categories ORDER BY latest.source)
              FROM post_moderation_versions version
              JOIN LATERAL (
                SELECT DISTINCT ON (source) source, disposition
                FROM post_moderation_dispositions
                WHERE version_id = version.id
                  AND source IN ('openai_omni', 'spam_detection')
                ORDER BY source, id DESC
              ) latest ON latest.disposition IN ('review', 'reject')
              WHERE version.post_id = p.id
                AND version.content_sha256 = p.llm_moderation_content_sha256
                AND version.policy_revision = '2026-09-09.1'
            ), '{}'::moderation_transparency_categories[])
          FROM posts p
          WHERE p.id = ${context.post_id}
            AND p.in_review_at IS NOT NULL
          RETURNING id, post_id, created_at, changed_by_id
        )
        UPDATE posts
        SET clearance_version = posts.clearance_version + 1,
              clearance_changed_at = inserted_change.created_at,
            clearance_changed_by_id = inserted_change.changed_by_id,
            clearance_public_reason_code = NULL,
            clearance_is_platform_override = FALSE,
            approved_at = NULL,
            rejected_at = inserted_change.created_at,
            in_review_at = NULL,
            updated_by_id = ${input.actorUserId}
        FROM inserted_change
        WHERE posts.id = inserted_change.post_id
      `)
  if ((rejectResult.rowCount ?? 0) > 0) {
    await recordPostPublicationChange(query, {
      scope: { type: 'post', postId: context.post_id },
      reason: 'post_clearance_changed',
      footprint: { priorCommunityId: input.communityId },
    })
    await recordModeratorAction(
      input.actorUserId,
      {
        actionType: 'reject',
        communityId: input.communityId,
        postId: context.post_id,
        reason: input.note ?? null,
        metadata: { source_key: input.sourceKey, moderation_training: true },
      },
      { query },
    )
  }
}
