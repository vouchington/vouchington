import { write } from '@data-stores/psql'
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
