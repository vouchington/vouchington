import type { CommunityApplication } from '../types.mts'

type CommunityApplicationScalarColumn = Exclude<
  keyof CommunityApplication,
  '__entity_type' | 'answers'
>

// Every stored response column. `answers` is projected from child rows below.
const communityApplicationScalarColumnNames = Object.keys({
  id: true,
  community_id: true,
  user_id: true,
  message: true,
  reviewed_at: true,
  reviewed_by_id: true,
  approved_at: true,
  rejected_at: true,
  rejection_reason: true,
  created_at: true,
} satisfies Record<CommunityApplicationScalarColumn, true>)

const communityApplicationAnswersProjection = `COALESCE(
  (
    SELECT jsonb_object_agg(
      answer.question_id::text,
      CASE
        WHEN answer.is_null THEN 'null'::jsonb
        WHEN answer.question_field_type IN ('short_text', 'long_text') THEN to_jsonb(answer.text_value)
        WHEN answer.question_field_type = 'checkbox' THEN to_jsonb(answer.boolean_value)
        WHEN answer.question_field_type = 'single_select' THEN (
          SELECT to_jsonb(option.label)
          FROM community_application_answer_selections selected
          JOIN community_application_question_options option
            ON option.id = selected.option_id
          WHERE selected.application_answer_id = answer.id
        )
        ELSE COALESCE(
          (
            SELECT jsonb_agg(option.label ORDER BY selected.order_index)
            FROM community_application_answer_selections selected
            JOIN community_application_question_options option
              ON option.id = selected.option_id
            WHERE selected.application_answer_id = answer.id
          ),
          '[]'::jsonb
        )
      END
    )
    FROM community_application_answers answer
    WHERE answer.application_id = community_applications.id
  ),
  '{}'::jsonb
) AS answers`

/** Response-facing application columns, including answers rebuilt from child rows. */
export const communityApplicationColumns = `${communityApplicationScalarColumnNames.join(', ')}, ${communityApplicationAnswersProjection}`
