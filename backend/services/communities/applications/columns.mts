import type { CommunityApplication } from '../types.mts'

type CommunityApplicationColumn = Exclude<keyof CommunityApplication, '__entity_type'>

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
} satisfies Record<CommunityApplicationColumn, string>

/** Response-facing application columns for a single-table `FROM community_applications` SELECT. */
export const communityApplicationColumns = Object.values(communityApplicationExpressions).join(', ')
