import { read, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import type { CommunityMember, CommunityMemberRole } from '@voucha/types/entities/community'
import { definePlanStatisticsRefresh, type PlanStatisticsRefresh } from '../query-plans.mts'

type InsertTestCommunityMemberOptions = {
  communityId: string
  userId: string
  role?: CommunityMemberRole
  approvedById?: string | null
  createdAt?: Date
  entities?: unknown[]
}

export async function insertTestCommunityMember(
  options: InsertTestCommunityMemberOptions,
): Promise<CommunityMember> {
  const id = options.createdAt ? uuidv7({ msecs: options.createdAt.getTime() }) : null
  const { rows } = options.createdAt
    ? await write(
        sql`/* insertTestCommunityMember */
        INSERT INTO community_members (community_id, user_id, role, approved_by_id, id)
        VALUES (
          ${options.communityId},
          ${options.userId},
          ${options.role ?? 'member'},
          ${options.approvedById ?? null},
          ${id}
        )
        RETURNING *
        `,
      )
    : await write(
        sql`/* insertTestCommunityMember */
        INSERT INTO community_members (community_id, user_id, role, approved_by_id)
        VALUES (
          ${options.communityId},
          ${options.userId},
          ${options.role ?? 'member'},
          ${options.approvedById ?? null}
        )
        RETURNING *
        `,
      )
  return rows[0] as CommunityMember
}

export async function insertTestCommunityMembershipsForUser(
  createdById: string,
  userId: string,
  count: number,
): Promise<void> {
  await write(sql`/* insertTestCommunityMembershipsForUser */
    WITH inserted_communities AS (
      INSERT INTO communities (name, slug, created_by_id)
      SELECT
        'Membership plan ' || uuidv7()::text,
        'membership-plan-' || uuidv7()::text,
        ${createdById}
      FROM generate_series(1, ${count})
      RETURNING id
    )
    INSERT INTO community_members (community_id, user_id, role)
    SELECT id, ${userId}, 'member'
    FROM inserted_communities
  `)
}

export const analyzeCommunityMembershipsForTest: PlanStatisticsRefresh =
  definePlanStatisticsRefresh(async () => {
    await write(
      sql`/* analyzeCommunityMembershipsForTest */ ANALYZE community_members, communities`,
    )
  })

export async function getTestCommunityMember(
  communityId: string,
  userId: string,
): Promise<CommunityMember | null> {
  const { rows } = await read<CommunityMember>(
    sql`/* getTestCommunityMember */
    SELECT *
    FROM community_members
    WHERE community_id = ${communityId}
      AND user_id = ${userId}
      AND removed_at IS NULL
    LIMIT 1
    `,
  )
  return rows[0] ?? null
}

export async function removeTestCommunityMember(
  communityId: string,
  userId: string,
  options: QueryOptions = {},
): Promise<void> {
  await write(
    sql`/* removeTestCommunityMember */
    UPDATE community_members
    SET removed_at = CURRENT_TIMESTAMP
    WHERE community_id = ${communityId}
      AND user_id = ${userId}
      AND removed_at IS NULL
    `,
    options,
  )
}

export async function lockTestCommunityMemberForUpdate(
  communityId: string,
  userId: string,
  options: QueryOptions,
): Promise<void> {
  await write(
    sql`/* lockTestCommunityMemberForUpdate */
      SELECT id
      FROM community_members
      WHERE community_id = ${communityId}
        AND user_id = ${userId}
        AND removed_at IS NULL
      FOR UPDATE
    `,
    options,
  )
}

export async function setTestCommunityDigestVacationSuppression(
  communityId: string,
  userId: string,
  suppress: boolean,
): Promise<void> {
  await write(sql`/* setTestCommunityDigestVacationSuppression */
    UPDATE community_members
    SET suppress_community_digests_while_on_vacation = ${suppress}
    WHERE community_id = ${communityId}
      AND user_id = ${userId}
      AND removed_at IS NULL
  `)
}

export async function updateTestCommunityMemberRole(
  communityId: string,
  userId: string,
  role: CommunityMemberRole,
  options: QueryOptions = {},
): Promise<void> {
  await write(
    sql`/* updateTestCommunityMemberRole */
    UPDATE community_members
    SET role = ${role}
    WHERE community_id = ${communityId}
      AND user_id = ${userId}
      AND removed_at IS NULL
    `,
    options,
  )
}
