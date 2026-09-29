import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { CommunityApplication } from '@voucha/types/entities/community'

type InsertTestCommunityApplicationOptions = {
  communityId: string
  userId: string
  /** Answers keyed by an existing question id of the community; each key becomes an answer row. */
  answers?: Record<string, unknown>
  message?: string | null
}

export async function insertTestCommunityApplication(
  options: InsertTestCommunityApplicationOptions,
): Promise<CommunityApplication> {
  const answers = options.answers ?? {}
  const { rows } = await write(
    sql`/* insertTestCommunityApplication */
    WITH created AS (
      INSERT INTO community_applications (community_id, user_id, message)
      VALUES (${options.communityId}, ${options.userId}, ${options.message ?? null})
      RETURNING id, community_id, user_id, message, reviewed_at, reviewed_by_id,
        approved_at, rejected_at, rejection_reason, created_at
    ), inserted AS (
      INSERT INTO community_application_answers (application_id, community_id, question_id, value)
      SELECT created.id, created.community_id, answer.key::uuid, answer.value
      FROM created
      CROSS JOIN LATERAL jsonb_each(${JSON.stringify(answers)}::jsonb) AS answer
    )
    SELECT * FROM created
    `,
  )
  const row = rows[0] as Omit<CommunityApplication, '__entity_type' | 'answers'>
  return {
    __entity_type: 'community_application',
    ...row,
    answers,
  }
}
