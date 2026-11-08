import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { createCodedError } from '@vouchington/sentry'
import { isAdminUser } from '@services/users/authorization'
import { recordModeratorAction } from '@services/moderator-actions'
import {
  COMMUNITY_BAN_LIFT_ALL_FORBIDDEN,
  COMMUNITY_BAN_LIFT_ALL_LIMIT_REACHED,
} from '@modules/on-error/error-codes'
import type { PrivateUser } from '@services/users/types'
import { getCommunitiesWorkLimit } from '../work-limits.mts'

export interface CommunityBanLiftResult {
  community_id: string
  user_id: string
  lifted_ban_ids: string[]
}

export async function liftCommunityBan(
  currentUser: PrivateUser,
  communityId: string,
  banId: string,
): Promise<CommunityBanLiftResult> {
  return liftSelectedCommunityBans(currentUser, communityId, banId, false)
}

export async function liftAllCommunityBans(
  currentUser: PrivateUser,
  communityId: string,
  userId: string,
): Promise<CommunityBanLiftResult> {
  return liftSelectedCommunityBans(currentUser, communityId, userId, true)
}

interface LiftStatementResult {
  candidate_count: number
  actor_allowed: boolean
  protected_issuer: boolean
  user_id: string | null
  lifted_ban_ids: string[]
}

async function liftSelectedCommunityBans(
  currentUser: PrivateUser,
  communityId: string,
  targetId: string,
  liftAll: boolean,
): Promise<CommunityBanLiftResult> {
  const cap = liftAll ? getCommunitiesWorkLimit('lift_all_active_ban_limit') : 1
  const isAdmin = isAdminUser(currentUser)
  const candidateScope = liftAll ? sql`AND user_id = ${targetId}` : sql`AND id = ${targetId}`

  await using transaction = await beginTransaction()
  // Gate before write-target locks; then lock selected ban rows by id for consistent lock order.
  // Scalar-array key probes prevent generic plans from scanning unselected ban history.
  // A concurrent insertion is outside this statement's snapshot and remains active.
  const { rows } = await write<LiftStatementResult>(
    sql`/* liftSelectedCommunityBans */
      WITH candidates AS MATERIALIZED (
        SELECT id, user_id, banned_by_id
        FROM community_bans
        WHERE community_id = ${communityId}
          AND lifted_at IS NULL
          AND COALESCE(expires_at, 'infinity'::timestamptz) > CURRENT_TIMESTAMP
      `.append(candidateScope).append(sql`
        ORDER BY COALESCE(expires_at, 'infinity'::timestamptz), id
        LIMIT ${liftAll ? cap + 1 : 1}
      ),
      protected_issuers AS MATERIALIZED (
        SELECT DISTINCT candidate.banned_by_id
        FROM candidates candidate
        JOIN community_members member
          ON member.community_id = ${communityId}
          AND member.user_id = candidate.banned_by_id
          AND member.role = 'owner' AND member.removed_at IS NULL
        WHERE candidate.banned_by_id <> ${currentUser.id}
        UNION
        SELECT DISTINCT candidate.banned_by_id
        FROM candidates candidate
        JOIN user_roles role ON role.user_id = candidate.banned_by_id
        JOIN user_role_types role_type ON role_type.id = role.role_type_id
          AND role_type.slug = 'administrator'
        JOIN users issuer ON issuer.id = candidate.banned_by_id
          AND issuer.deleted_at IS NULL
        WHERE candidate.banned_by_id <> ${currentUser.id}
      ),
      gate AS MATERIALIZED (
        SELECT
          (SELECT count(*)::int FROM candidates) AS candidate_count,
          (${isAdmin}::boolean OR EXISTS (
            SELECT 1 FROM community_members actor
            WHERE actor.community_id = ${communityId}
              AND actor.user_id = ${currentUser.id}
              AND actor.removed_at IS NULL
              AND actor.role IN ('owner', 'moderator')
          )) AS actor_allowed,
          (NOT ${isAdmin}::boolean AND EXISTS (
            SELECT 1 FROM community_members actor
            WHERE actor.community_id = ${communityId}
              AND actor.user_id = ${currentUser.id}
              AND actor.removed_at IS NULL
              AND actor.role = 'moderator'
          ) AND EXISTS (SELECT 1 FROM protected_issuers)) AS protected_issuer
      ),
      locked AS MATERIALIZED (
        SELECT ban.id
        FROM community_bans ban
        CROSS JOIN gate
        WHERE gate.candidate_count BETWEEN 1 AND ${cap}
          AND gate.actor_allowed AND NOT gate.protected_issuer
          AND ban.id = ANY(ARRAY(SELECT candidate.id FROM candidates candidate))
          AND ban.lifted_at IS NULL
          AND COALESCE(ban.expires_at, 'infinity'::timestamptz) > CURRENT_TIMESTAMP
        ORDER BY ban.id
        FOR UPDATE OF ban
      ),
      lifted AS (
        UPDATE community_bans ban
        SET lifted_at = CURRENT_TIMESTAMP, lifted_by_id = ${currentUser.id}
        FROM locked
        WHERE ban.id = locked.id
        RETURNING ban.id
      )
      SELECT gate.candidate_count, gate.actor_allowed, gate.protected_issuer,
        (SELECT user_id FROM candidates LIMIT 1) AS user_id,
        COALESCE((SELECT array_agg(id ORDER BY id) FROM lifted), '{}'::uuid[]) AS lifted_ban_ids
      FROM gate
      `),
    { query: transaction },
  )
  const result = rows[0]!
  assert(result.actor_allowed, 403, 'Forbidden')
  if (result.protected_issuer) {
    if (liftAll)
      throw createCodedError(
        403,
        COMMUNITY_BAN_LIFT_ALL_FORBIDDEN,
        COMMUNITY_BAN_LIFT_ALL_FORBIDDEN,
      )
    assert(false, 403, 'Only an owner or admin can lift this ban')
  }
  if (liftAll && result.candidate_count > cap) {
    throw Object.assign(
      createCodedError(
        409,
        COMMUNITY_BAN_LIFT_ALL_LIMIT_REACHED,
        COMMUNITY_BAN_LIFT_ALL_LIMIT_REACHED,
      ),
      { cap },
    )
  }
  assert(result.candidate_count > 0, 404, 'No active ban found')
  assert(result.lifted_ban_ids.length > 0, 404, 'No active ban found')
  await transaction.commit()

  await recordModeratorAction(currentUser.id, {
    actionType: 'lift_ban',
    communityId,
    targetUserId: result.user_id!,
  })
  return {
    community_id: communityId,
    user_id: result.user_id!,
    lifted_ban_ids: result.lifted_ban_ids,
  }
}
