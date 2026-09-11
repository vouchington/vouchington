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
        openai_omni_moderation_flagged,
        spam_detection_flagged
      FROM posts
      WHERE id = ${postId}
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
