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
  if (options.answers && Object.keys(options.answers).length > 0) {
    throw new Error(
      'insertTestCommunityApplication persists an empty answer set; use createApplication for answers',
    )
  }
  const { rows } = await write(
    sql`/* insertTestCommunityApplication */
    INSERT INTO community_applications (community_id, user_id, message)
    VALUES (
      ${options.communityId},
      ${options.userId},
      ${options.message ?? null}
    )
    RETURNING id, community_id, user_id, message, reviewed_at, reviewed_by_id,
      approved_at, rejected_at, rejection_reason, created_at
    `,
  )
  const row = rows[0] as Omit<CommunityApplication, '__entity_type' | 'answers'>
  return {
    __entity_type: 'community_application',
    ...row,
    answers: {},
  }
}
