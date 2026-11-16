import type { PoolClient } from '@data-stores/psql'
import type { CreatedNotification } from './reconcile-batches.mts'
import { getPostRouteSlug } from './shared.mts'

export type PostNotificationInsertInput = {
  id: string
  post_type: string
  title: string
  markdown: string
  slug: string | null
  username: string | null
  is_anonymous: boolean
  root_post_id: string | null
  root_slug: string | null
  root_post_type: string | null
}

export async function insertPostNotificationsForRecipients(
  post: PostNotificationInsertInput,
  recipientIds: string[],
  client: PoolClient,
  createdTable: string,
): Promise<CreatedNotification[]> {
  if (recipientIds.length === 0) return []

  const targetPath =
    post.post_type === 'comment'
      ? `/${getPostRouteSlug(post.root_post_type ?? 'discussion')}/${post.root_slug ?? post.root_post_id ?? post.id}/comment/${post.id}`
      : `/${getPostRouteSlug(post.post_type)}/${post.slug ?? post.id}`
  const kind = post.post_type === 'comment' ? 'post_reply' : 'post_new'

  const { rows } = await client.query<CreatedNotification>(
    `/* insertPostNotificationsForRecipients */
    WITH recipients AS (
      SELECT user_id
      FROM unnest($1::uuid[]) AS recipient(user_id)
    ),
    restored AS (
      UPDATE notifications
      SET deleted_at = NULL,
          delete_reason = NULL,
          target_path = $3
      WHERE post_id = $4
        AND delivery_type = 'subscription'
        AND deleted_at IS NOT NULL
        AND delete_reason = 'system_pruned'
        AND user_id IN (SELECT user_id FROM recipients)
      RETURNING user_id, id
    ),
    created AS (
      INSERT INTO notifications (
        user_id,
        entity_type,
        kind,
        post_id,
        target_path
      )
      SELECT
        recipients.user_id,
        'post',
        $2::notification_kinds,
        $4,
        $3
      FROM recipients
      WHERE NOT EXISTS (
        SELECT 1
        FROM notifications
        WHERE post_id = $4
          AND user_id = recipients.user_id
          AND delivery_type = 'subscription'
          AND deleted_at IS NULL
      )
        AND NOT EXISTS (
          SELECT 1
          FROM notifications
          WHERE post_id = $4
            AND user_id = recipients.user_id
            AND delivery_type = 'subscription'
            AND delete_reason = 'user_deleted'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM restored
          WHERE restored.user_id = recipients.user_id
        )
      ORDER BY recipients.user_id
      ON CONFLICT (user_id, post_id)
        WHERE post_id IS NOT NULL AND deleted_at IS NULL AND delivery_type = 'subscription'
        DO NOTHING
      RETURNING user_id, id
    ),
    inserted AS (
      INSERT INTO ${createdTable} (user_id, id)
      SELECT user_id, id
      FROM created
      -- no-mistakes: deadlock-safe -- random session-private temp table has no schema catalog entry.
      ORDER BY user_id, id
      RETURNING user_id, id
    )
    SELECT user_id, id
    FROM inserted
  `,
    [recipientIds, kind, targetPath, post.id],
  )

  return rows
}
