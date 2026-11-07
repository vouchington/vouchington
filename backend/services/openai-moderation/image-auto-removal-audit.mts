import { read } from '@data-stores/psql'
import { recordModeratorActions } from '@services/moderator-actions'
import { getModerationSystemUserId } from '@services/users/system-users'
import sql from 'sql-template-strings'

export async function recordImageAutoRemoval(
  imageId: string,
  options?: { reason?: string },
): Promise<void> {
  const reason = options?.reason ?? 'openai_image_moderation'
  const [moderationSystemUserId, targets] = await Promise.all([
    getModerationSystemUserId(),
    getImagePostTargets(imageId),
  ])
  const actionTargets = targets.length > 0 ? targets : [null]
  await recordModeratorActions(
    moderationSystemUserId,
    actionTargets.map(target => ({
      actionType: 'remove' as const,
      communityId: target?.community_id ?? null,
      postId: target?.post_id ?? null,
      metadata: { reason, imageId },
    })),
  )
}

async function getImagePostTargets(
  imageId: string,
): Promise<Array<{ post_id: string; community_id: string | null }>> {
  const { rows } = await read<{ post_id: string; community_id: string | null }>(
    sql`/* getImagePostTargets */
    SELECT pi.post_id, p.community_id
    FROM post_images pi
    JOIN posts p ON p.id = pi.post_id
    WHERE pi.image_id = ${imageId}
    ORDER BY pi.order_index ASC
  `,
  )
  return rows
}
