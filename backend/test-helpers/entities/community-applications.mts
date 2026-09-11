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
  const { rows } = await write(
    sql`/* insertTestCommunityApplication */
    INSERT INTO community_applications (community_id, user_id, answers, message)
    VALUES (
      ${options.communityId},
      ${options.userId},
      ${JSON.stringify(options.answers ?? {})}::jsonb,
      ${options.message ?? null}
    )
    RETURNING *
    `,
  )
  return rows[0] as CommunityApplication
}
