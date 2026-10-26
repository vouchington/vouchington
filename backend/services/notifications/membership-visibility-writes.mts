import { beginTransaction, writePool, type PoolClient } from '@data-stores/psql'
import { createTempTableName } from './reconcile-temp-tables.mts'
import type {
  ContentVisibilityCursor,
  ContentVisibilityPage,
} from './content-visibility-writes.mts'
import { getContentVisibilityPageLimit } from './work-limits.mts'

const FIRST_UUID = '00000000-0000-0000-0000-000000000000'

type MembershipVisibilityInput = {
  kind: 'post' | 'rss'
  entityId: string
  eligible: boolean
  after?: ContentVisibilityCursor
  populateRecipients: (client: PoolClient, table: string, userIds: string[]) => Promise<void>
}

/** Prune one raw publication-target page after rechecking its candidate users. */
export async function reconcileMembershipNotificationVisibility(
  input: MembershipVisibilityInput,
): Promise<ContentVisibilityPage> {
  if (!input.eligible) return { updated: 0, pruned: 0 }
  const pageSize = getContentVisibilityPageLimit()
  const publicationColumn =
    input.kind === 'post' ? 'publication_post_id' : 'publication_rss_feed_item_id'
  const liveColumn = input.kind === 'post' ? 'post_id' : 'rss_feed_item_id'
  const cursorOperator = input.after ? '>' : '>='
  const client = await writePool.connect()
  try {
    await using transaction = await beginTransaction({ client })
    const { rows } = await client.query<{ user_id: string; id: string }>(
      `/* selectMembershipVisibilityTargetPage */
        SELECT notification.user_id, notification.id
        FROM notifications notification
        WHERE notification.${publicationColumn} = $1
          AND (notification.user_id, notification.id) ${cursorOperator} ($2::uuid, $3::uuid)
        ORDER BY notification.user_id, notification.id
        LIMIT $4
        FOR UPDATE OF notification`,
      [
        input.entityId,
        input.after?.userId ?? FIRST_UUID,
        input.after?.notificationId ?? FIRST_UUID,
        pageSize,
      ],
    )
    let pruned = 0
    if (rows.length > 0) {
      const table = createTempTableName('temp_notification_membership_recipients')
      await client.query(`/* createMembershipVisibilityRecipients */
        CREATE TEMP TABLE ${table} (user_id UUID PRIMARY KEY) ON COMMIT DROP`)
      await input.populateRecipients(client, table, [...new Set(rows.map(row => row.user_id))])
      const { rowCount } = await client.query(
        `/* pruneMembershipVisibilityTargetPage */
          UPDATE notifications notification
          SET deleted_at = CURRENT_TIMESTAMP,
              delete_reason = 'system_pruned'
          FROM UNNEST($2::uuid[], $3::uuid[]) target(user_id, id)
          WHERE notification.user_id = target.user_id AND notification.id = target.id
            AND notification.${liveColumn} = $1
            AND notification.delivery_type = 'subscription'
            AND notification.deleted_at IS NULL
            AND notification.read_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM ${table} recipients WHERE recipients.user_id = notification.user_id
            )`,
        [input.entityId, rows.map(row => row.user_id), rows.map(row => row.id)],
      )
      pruned = rowCount ?? 0
    }
    await transaction.commit()
    const last = rows.at(-1)
    return {
      updated: pruned,
      pruned,
      ...(rows.length === pageSize && last
        ? { nextCursor: { userId: last.user_id, notificationId: last.id } }
        : {}),
    }
  } finally {
    client.release()
  }
}
