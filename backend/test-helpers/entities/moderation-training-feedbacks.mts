import { read } from '@data-stores/psql'
import { trainingMetadataFromRow } from '@services/moderation-training/metadata-facts.mts'
import sql from 'sql-template-strings'

export async function getTestPostClearanceState(postId: string): Promise<
  | {
      approved_at: Date | null
      rejected_at: Date | null
      openai_omni_moderation_flagged: boolean | null
      spam_detection_flagged: boolean | null
    }
  | undefined
> {
  const { rows } = await read<{
    approved_at: Date | null
    rejected_at: Date | null
    openai_omni_moderation_flagged: boolean | null
    spam_detection_flagged: boolean | null
  }>(
    sql`/* getTestPostClearanceState */
      SELECT
        approved_at,
        rejected_at,
        CASE WHEN openai.disposition IS NULL THEN NULL ELSE openai.disposition <> 'pass' END AS openai_omni_moderation_flagged,
        CASE WHEN spam.disposition IS NULL THEN NULL ELSE spam.disposition <> 'pass' END AS spam_detection_flagged
      FROM posts post
      LEFT JOIN post_moderation_versions version
        ON version.post_id = post.id
       AND version.content_sha256 = post.llm_moderation_content_sha256
       AND version.policy_revision = '2026-09-09.1'
      LEFT JOIN LATERAL (
        SELECT disposition
        FROM post_moderation_dispositions
        WHERE version_id = version.id AND source = 'openai_omni'
        ORDER BY id DESC LIMIT 1
      ) openai ON true
      LEFT JOIN LATERAL (
        SELECT disposition
        FROM post_moderation_dispositions
        WHERE version_id = version.id AND source = 'spam_detection'
        ORDER BY id DESC LIMIT 1
      ) spam ON true
      WHERE post.id = ${postId}
      ORDER BY version.id DESC NULLS LAST LIMIT 1
      `,
  )
  return rows[0]
}

export async function getLatestTestModerationTrainingFeedback(input: {
  postId: string
  sourceType: string
  humanAction: string
}): Promise<
  | {
      label: string
      community_id: string | null
      metadata: Record<string, unknown>
    }
  | undefined
> {
  const { rows } = await read<Record<string, unknown>>(
    sql`/* getLatestTestModerationTrainingFeedback */
    SELECT
      label,
      community_id,
      metadata_source_key,
      metadata_outcome,
      metadata_source_type,
      metadata_score,
      metadata_score_present,
      metadata_recommended_action,
      metadata_reason,
      metadata_report_entity_type,
      metadata_report_reason,
      metadata_report_post_id,
      metadata_report_user_id,
      metadata_report_hostname_id,
      metadata_report_rss_feed_item_id,
      metadata_community_trusted,
      metadata_community_trusted_present,
      metadata_clearance_status,
      metadata_prompt_id,
      metadata_prompt_model_name,
      metadata_prompt_model_provider,
      metadata_test_text,
      metadata_expected_flagged,
      metadata_expected_flagged_present,
      metadata_expected_reason,
      metadata_actual_flagged,
      metadata_actual_flagged_present,
      metadata_actual_reason
    FROM moderation_training_feedbacks
    WHERE post_id = ${input.postId}
      AND source_type = ${input.sourceType}
      AND human_action = ${input.humanAction}
    ORDER BY id DESC
    LIMIT 1
  `,
  )
  const row = rows[0]
  if (!row) return undefined
  return {
    label: String(row.label),
    community_id: row.community_id == null ? null : String(row.community_id),
    metadata: trainingMetadataFromRow(row),
  }
}

export async function getLatestTestAppealTrainingFeedback(
  moderationAppealId: string,
): Promise<{ label: string; post_id: string | null } | undefined> {
  const { rows } = await read<{ label: string; post_id: string | null }>(
    sql`/* getLatestTestAppealTrainingFeedback */
      SELECT label, post_id
      FROM moderation_training_feedbacks
      WHERE moderation_appeal_id = ${moderationAppealId}
        AND source_type = 'moderation_appeal'
      ORDER BY id DESC
      LIMIT 1
    `,
  )
  return rows[0]
}
