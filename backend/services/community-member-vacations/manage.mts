import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { CommunityMemberVacation, CommunityMemberVacationSettings } from './types.mts'

export async function setMyCommunityVacation(
  currentUserId: string,
  options: {
    communityId: string
    endsAt?: string | null
  },
): Promise<CommunityMemberVacation> {
  const { communityId, endsAt } = options
  const { rows } = await write<CommunityMemberVacation>(sql`/* setMyCommunityVacation */
    INSERT INTO community_member_vacations (community_id, user_id, starts_at, ends_at, updated_at)
    VALUES (${communityId}, ${currentUserId}, now(), ${endsAt ?? null}, now())
    ON CONFLICT (community_id, user_id) DO UPDATE SET
      starts_at  = now(),
      ends_at    = EXCLUDED.ends_at,
      updated_at = now()
    RETURNING community_id, user_id, starts_at, ends_at, created_at, updated_at
  `)
  return rows[0]!
}

export async function clearMyCommunityVacation(
  currentUserId: string,
  options: { communityId: string },
): Promise<void> {
  await write(sql`/* clearMyCommunityVacation */
    DELETE FROM community_member_vacations
    WHERE community_id = ${options.communityId}
      AND user_id      = ${currentUserId}
  `)
}

export async function getMyCommunityVacation(
  currentUserId: string,
  options: { communityId: string },
): Promise<CommunityMemberVacation | null> {
  const { rows } = await read<CommunityMemberVacation>(sql`/* getMyCommunityVacation */
    SELECT community_id, user_id, starts_at, ends_at, created_at, updated_at
    FROM community_member_vacations
    WHERE community_id = ${options.communityId}
      AND user_id      = ${currentUserId}
      AND starts_at    <= now()
      AND (ends_at IS NULL OR ends_at > now())
    LIMIT 1
  `)
  return rows[0] ?? null
}

export async function getMyCommunityVacationSettings(
  currentUserId: string,
  options: { communityId: string },
): Promise<CommunityMemberVacationSettings> {
  const { rows } = await read<
    CommunityMemberVacation & { suppress_community_digests_while_on_vacation: boolean }
  >(sql`/* getMyCommunityVacationSettings */
    SELECT
      v.community_id,
      v.user_id,
      v.starts_at,
      v.ends_at,
      v.created_at,
      v.updated_at,
      cm.suppress_community_digests_while_on_vacation
    FROM community_members cm
    LEFT JOIN community_member_vacations v
      ON v.community_id = cm.community_id
      AND v.user_id = cm.user_id
      AND v.starts_at <= now()
      AND (v.ends_at IS NULL OR v.ends_at > now())
    WHERE cm.community_id = ${options.communityId}
      AND cm.user_id = ${currentUserId}
      AND cm.removed_at IS NULL
    LIMIT 1
  `)
  const row = rows[0]
  return {
    vacation:
      row?.starts_at == null
        ? null
        : {
            community_id: row.community_id,
            user_id: row.user_id,
            starts_at: row.starts_at,
            ends_at: row.ends_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
          },
    suppress_community_digests_while_on_vacation:
      row?.suppress_community_digests_while_on_vacation ?? false,
  }
}

export async function setSuppressCommunityDigestsWhileOnVacation(
  currentUserId: string,
  options: { communityId: string; suppress: boolean },
): Promise<boolean> {
  const { rows } = await write<{ suppress_community_digests_while_on_vacation: boolean }>(sql`
    /* setSuppressCommunityDigestsWhileOnVacation */
    UPDATE community_members
    SET suppress_community_digests_while_on_vacation = ${options.suppress}
    WHERE community_id = ${options.communityId}
      AND user_id = ${currentUserId}
      AND removed_at IS NULL
    RETURNING suppress_community_digests_while_on_vacation
  `)
  return rows[0]?.suppress_community_digests_while_on_vacation ?? false
}
