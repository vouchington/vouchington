import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import createHttpError from 'http-errors'

type OwnershipTransferRequest = { communityId: string; fromUserId: string; toUserId: string }
type OwnershipTransferOutcome = OwnershipTransferRequest & {
  ownerPresent: boolean
  transition: { demotedUpdatedAt: Date; promotedUpdatedAt: Date } | null
}

/**
 * Swaps roles for every request in one statement. A community is demoted only when its target is
 * promotable, so a rejected request leaves that community untouched without failing the others.
 */
export async function transferLockedCommunitiesOwnership(
  transfers: readonly OwnershipTransferRequest[],
  options: QueryOptions,
): Promise<OwnershipTransferOutcome[]> {
  if (transfers.length === 0) return []
  const { rows } = await write<{
    community_id: string
    owner_present: boolean
    demoted_updated_at: Date | null
    promoted_updated_at: Date | null
  }>(
    sql`/* transferCommunityOwnership */
    WITH input AS MATERIALIZED (
      SELECT community_id, from_user_id, to_user_id
      FROM unnest(
        ${transfers.map(transfer => transfer.communityId)}::uuid[],
        ${transfers.map(transfer => transfer.fromUserId)}::uuid[],
        ${transfers.map(transfer => transfer.toUserId)}::uuid[]
      ) AS t(community_id, from_user_id, to_user_id)
    ),
    demote AS (
      UPDATE community_members owner
      SET role = 'moderator'
      FROM input
      WHERE owner.community_id = input.community_id
        AND owner.user_id = input.from_user_id
        AND owner.role = 'owner'
        AND owner.removed_at IS NULL
        AND EXISTS (
          SELECT 1 FROM community_members target
          JOIN users target_user ON target_user.id = target.user_id
          WHERE target.community_id = input.community_id
            AND target.user_id = input.to_user_id
            AND target.role = 'moderator'
            AND target.removed_at IS NULL
            AND target_user.deleted_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM user_suspensions WHERE user_id = target.user_id AND lifted_at IS NULL)
            AND NOT EXISTS (SELECT 1 FROM user_deletion_requests WHERE user_id = target.user_id AND completed_at IS NULL)
        )
      RETURNING owner.community_id, owner.updated_at
    ),
    promote AS (
      UPDATE community_members target
      SET role = 'owner'
      FROM input
      WHERE target.community_id = input.community_id
        AND target.user_id = input.to_user_id
        AND target.role = 'moderator'
        AND target.removed_at IS NULL
        AND EXISTS (SELECT 1 FROM demote WHERE demote.community_id = input.community_id)
      RETURNING target.community_id, target.updated_at
    )
    SELECT input.community_id,
      EXISTS (
        SELECT 1 FROM community_members owner
        WHERE owner.community_id = input.community_id AND owner.user_id = input.from_user_id
          AND owner.role = 'owner' AND owner.removed_at IS NULL
      ) AS owner_present,
      demote.updated_at AS demoted_updated_at,
      promote.updated_at AS promoted_updated_at
    FROM input
    LEFT JOIN demote ON demote.community_id = input.community_id
    LEFT JOIN promote ON promote.community_id = input.community_id
    ORDER BY input.community_id
    `,
    options,
  )
  const byCommunity = new Map(rows.map(row => [row.community_id, row]))
  return transfers.map(transfer => {
    const row = byCommunity.get(transfer.communityId)!
    const transition =
      row.demoted_updated_at && row.promoted_updated_at
        ? { demotedUpdatedAt: row.demoted_updated_at, promotedUpdatedAt: row.promoted_updated_at }
        : null
    return { ...transfer, ownerPresent: row.owner_present, transition }
  })
}

export async function transferLockedCommunityOwnership(
  communityId: string,
  fromUserId: string,
  toUserId: string,
  options: QueryOptions,
): Promise<{ demotedUpdatedAt: Date; promotedUpdatedAt: Date }> {
  const [outcome] = await transferLockedCommunitiesOwnership(
    [{ communityId, fromUserId, toUserId }],
    options,
  )
  if (!outcome!.ownerPresent) throw createHttpError(409, 'Community ownership changed concurrently')
  if (!outcome!.transition)
    throw createHttpError(422, 'Target user is no longer an eligible moderator')
  return outcome!.transition
}
