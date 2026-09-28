import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { CommunityApplication } from '@voucha/types/entities/community'

type InsertTestCommunityApplicationOptions = {
  communityId: string
  userId: string
  answers?: Record<string, unknown>
  message?: string | null
}

export async function insertTestCommunityApplication(
  options: InsertTestCommunityApplicationOptions,
): Promise<CommunityApplication> {
  const answers = options.answers ?? {}
  const { rows } = await write(
    sql`/* insertTestCommunityApplication */
    INSERT INTO community_applications (community_id, user_id, answers, message)
    VALUES (
      ${options.communityId},
      ${options.userId},
      ${JSON.stringify(answers)}::jsonb,
      ${options.message ?? null}
    )
    RETURNING id, community_id, user_id, answers, message, reviewed_at, reviewed_by_id,
      approved_at, rejected_at, rejection_reason, created_at
    `,
  )
  const row = rows[0] as Omit<CommunityApplication, '__entity_type'>
  return {
    __entity_type: 'community_application',
    ...row,
  }
}
