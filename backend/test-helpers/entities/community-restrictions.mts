import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type {
  CommunityRestriction,
  CommunityRestrictionType,
} from '@voucha/types/entities/community'

type InsertTestCommunityRestrictionOptions = {
  communityId: string
  restrictionType: CommunityRestrictionType
  activatedById: string
  activatedAt?: Date
  expiresAt?: Date | null
  liftedAt?: Date | null
  liftedById?: string | null
  reason?: string | null
}

export async function insertTestCommunityRestriction(
  options: InsertTestCommunityRestrictionOptions,
): Promise<CommunityRestriction> {
  const { rows } = await write(
    sql`/* insertTestCommunityRestriction */
    INSERT INTO community_restrictions (
      community_id,
      restriction_type,
      activated_by_id,
      activated_at,
      expires_at,
      lifted_at,
      lifted_by_id,
      reason
    )
    VALUES (
      ${options.communityId},
      ${options.restrictionType},
      ${options.activatedById},
      ${options.activatedAt ?? new Date()},
      ${options.expiresAt ?? null},
      ${options.liftedAt ?? null},
      ${options.liftedById ?? null},
      ${options.reason ?? null}
    )
    RETURNING *
    `,
  )
  return rows[0] as CommunityRestriction
}

export async function deleteTestCommunityRestriction(restrictionId: string): Promise<void> {
  await write(sql`/* deleteTestCommunityRestriction */
    DELETE FROM community_restrictions WHERE id = ${restrictionId}`)
}

/** Restriction ids a moderator action activated or lifted, stored as child rows. */
export async function getTestModeratorActionRestrictionIds(
  moderatorActionId: string,
): Promise<string[]> {
  const { rows } = await read<{ community_restriction_id: string }>(
    sql`/* getTestModeratorActionRestrictionIds */
    SELECT community_restriction_id
    FROM moderator_action_community_restrictions
    WHERE moderator_action_id = ${moderatorActionId}
    ORDER BY community_restriction_id
    `,
  )
  return rows.map(row => row.community_restriction_id)
}
