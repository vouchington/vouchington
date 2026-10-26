import { getRemoteActorsWorkLimit } from '@services/remote-actors/work-limits'
import { listRemoteFollowerInboxPage } from '@services/remote-actors'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type ActivityDistributionPage = {
  nextRemoteActorId: string | null
  inboxUrls: string[]
  hasMore: boolean
}

// The job payload owns the cursor. Re-reading a page after a stall can repeat deliveries, but
// every delivery carries the same ActivityPub activity id, so remote receivers ignore repeats.
export async function prepareActivityDistributionPage(
  sourceUserId: string,
  cursorRemoteActorId: string | null,
  pageSize = getRemoteActorsWorkLimit('follower_inbox_batch_size'),
): Promise<ActivityDistributionPage> {
  const candidates = await listRemoteFollowerInboxPage(
    sourceUserId,
    cursorRemoteActorId,
    pageSize + 1,
  )
  const page = candidates.slice(0, pageSize)
  return {
    nextRemoteActorId: page.at(-1)?.remoteActorId ?? cursorRemoteActorId,
    inboxUrls: [...new Set(page.flatMap(row => (row.inboxUrl ? [row.inboxUrl] : [])))],
    hasMore: candidates.length > pageSize,
  }
}

export type DistributedActivity =
  | { activityId: string; activityType: 'Follow'; sourceUserId: string; targetUserId: string }
  | {
      activityId: string
      activityType: 'UndoFollow'
      originalActivityId: string
      sourceUserId: string
      targetUserId: string
    }
  | {
      activityId: string
      activityType: 'Like' | 'UndoLike'
      sourceUserId: string
      targetPostId: string
    }

// Called after the dispatcher has durably admitted its final page. The relation predicates fence
// a stale job against a delete or re-follow generation; ballot events are immutable source rows.
export async function markActivityDistributionComplete(data: DistributedActivity): Promise<void> {
  if (data.activityType === 'Follow') {
    await write(sql`/* markActivityDistributionComplete:follow */
      UPDATE relation__user__follow__user
      SET outbound_activitypub_distributed_activity_id = ${data.activityId}
      WHERE subject_id = ${data.sourceUserId} AND object_id = ${data.targetUserId}
        AND deleted_at IS NULL
        AND outbound_activitypub_follow_activity_id = ${data.activityId}
    `)
    return
  }
  if (data.activityType === 'UndoFollow') {
    await write(sql`/* markActivityDistributionComplete:undoFollow */
      UPDATE relation__user__follow__user
      SET outbound_activitypub_distributed_activity_id = ${data.activityId}
      WHERE subject_id = ${data.sourceUserId} AND object_id = ${data.targetUserId}
        AND deleted_at IS NOT NULL
        AND outbound_activitypub_follow_activity_id = ${data.originalActivityId}
    `)
    return
  }
  await write(sql`/* markActivityDistributionComplete:like */
    UPDATE post_votes
    SET outbound_activitypub_distributed_at = clock_timestamp()
    WHERE post_id = ${data.targetPostId} AND id = ${data.activityId}
      AND user_id = ${data.sourceUserId}
  `)
}
