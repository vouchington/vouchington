import { read } from '@data-stores/psql'
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
  const { rows } = await read<{
    label: string
    community_id: string | null
    metadata: Record<string, unknown>
  }>(
    sql`/* getLatestTestModerationTrainingFeedback */
    SELECT label, community_id, metadata
    FROM moderation_training_feedbacks
    WHERE post_id = ${input.postId}
      AND source_type = ${input.sourceType}
      AND human_action = ${input.humanAction}
    ORDER BY id DESC
    LIMIT 1
  `,
  )
  return rows[0]
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
