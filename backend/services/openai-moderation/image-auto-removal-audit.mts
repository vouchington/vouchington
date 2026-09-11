import { read } from '@data-stores/psql'
import { recordModeratorAction } from '@services/moderator-actions'
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
  const results = await Promise.allSettled(
    actionTargets.map(target =>
      recordModeratorAction(moderationSystemUserId, {
        actionType: 'remove',
        communityId: target?.community_id ?? null,
        postId: target?.post_id ?? null,
        metadata: { reason, imageId },
      }),
    ),
  )
  const failures = results.filter(result => result.status === 'rejected')
  /* c8 ignore next 5 -- defensive aggregation for partial audit-write failures */
  if (failures.length > 0) {
    throw new AggregateError(
      failures.map(failure => failure.reason),
      'Failed to record one or more image auto-removal moderator actions',
    )
  }
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
