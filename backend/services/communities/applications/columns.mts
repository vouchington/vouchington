import type { CommunityApplication, CommunityApplicationSummary } from '../types.mts'

// The response `answers` object is rebuilt from the application's answer rows. Answers stay
// readable after their question is soft-deleted, so this does not filter on question state.
const answersExpression = `COALESCE(
  (
    SELECT jsonb_object_agg(answer.question_id::text, answer.value)
    FROM community_application_answers answer
    WHERE answer.application_id = community_applications.id
  ),
  '{}'::jsonb
) AS answers`

// Every declared CommunityApplication column and nothing else, as a SELECT expression.
const communityApplicationExpressions = {
  __entity_type: "'community_application' AS __entity_type",
  id: 'id',
  community_id: 'community_id',
  user_id: 'user_id',
  answers: answersExpression,
  message: 'message',
  reviewed_at: 'reviewed_at',
  reviewed_by_id: 'reviewed_by_id',
  approved_at: 'approved_at',
  rejected_at: 'rejected_at',
  rejection_reason: 'rejection_reason',
  created_at: 'created_at',
} satisfies Record<keyof CommunityApplication, string>

/** Response-facing application columns for a single-table `FROM community_applications` SELECT. */
export const communityApplicationColumns = Object.values(communityApplicationExpressions).join(', ')

/** Characters of the applicant's message a list row carries; the detail route has all of it. */
const APPLICATION_MESSAGE_PREVIEW_LENGTH = 200

const communityApplicationSummaryExpressions = {
  __entity_type: "'community_application_summary' AS __entity_type",
  id: 'id',
  user_id: 'user_id',
  status: `CASE
    WHEN approved_at IS NOT NULL THEN 'approved'
    WHEN rejected_at IS NOT NULL THEN 'rejected'
    ELSE 'pending'
  END AS status`,
  message_preview: `left(message, ${APPLICATION_MESSAGE_PREVIEW_LENGTH}) AS message_preview`,
  answer_count: `(
    SELECT count(*)::int
    FROM community_application_answers answer
    WHERE answer.application_id = community_applications.id
  ) AS answer_count`,
  created_at: 'created_at',
} satisfies Record<keyof CommunityApplicationSummary, string>

/** Summary columns for a single-table `FROM community_applications` list SELECT. */
export const communityApplicationSummaryColumns = Object.values(
  communityApplicationSummaryExpressions,
).join(', ')
