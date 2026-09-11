import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

type InsertTestCommunityVacationOptions = {
  communityId: string
  userId: string
  /** ISO string. Defaults to now(). */
  startsAt?: string
  /** ISO string. Null means indefinite. */
  endsAt?: string | null
}

export async function insertTestCommunityVacation(
  options: InsertTestCommunityVacationOptions,
): Promise<void> {
  const { communityId, userId, startsAt, endsAt = null } = options
  await write(sql`/* insertTestCommunityVacation */
    INSERT INTO community_member_vacations (community_id, user_id, starts_at, ends_at)
    VALUES (
      ${communityId},
      ${userId},
      ${startsAt ?? new Date().toISOString()},
      ${endsAt}
    )
    ON CONFLICT (community_id, user_id) DO UPDATE SET
      starts_at = EXCLUDED.starts_at,
      ends_at   = EXCLUDED.ends_at
  `)
}
