import type { PoolClient } from '@data-stores/psql'
import type { CreatedNotification } from './reconcile-batches.mts'
import { reconcilePostContentNotificationVisibility } from './content-visibility-writes.mts'
import { getPostRouteSlug, truncateText } from './shared.mts'

export type PostNotificationInsertInput = {
  id: string
  post_type: string
  title: string
  markdown: string
  slug: string | null
  username: string | null
  is_anonymous: boolean
  root_id: string | null
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
      ? `/${getPostRouteSlug(post.root_post_type ?? 'discussion')}/${post.root_slug ?? post.root_id ?? post.id}/comment/${post.id}`
      : `/${getPostRouteSlug(post.post_type)}/${post.slug ?? post.id}`
  const displayUsername = post.is_anonymous ? null : post.username
  const title =
    post.post_type === 'comment'
      ? `New reply${displayUsername ? ` from @${displayUsername}` : ''}`
      : `New ${post.post_type === 'data_point' ? 'data point' : post.post_type}${displayUsername ? ` from @${displayUsername}` : ''}`
  const body = truncateText(post.title || post.markdown, 180)

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
          title = $2,
          body = $3,
          actor_label = $4,
          target_path = $5,
          updated_at = CURRENT_TIMESTAMP
      WHERE post_id = $6
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
        post_id,
        title,
        body,
        actor_label,
        target_path
      )
      SELECT
        recipients.user_id,
        'post',
        $6,
        $2,
        $3,
        $4,
        $5
      FROM recipients
      WHERE NOT EXISTS (
        SELECT 1
        FROM notifications
        WHERE post_id = $6
          AND user_id = recipients.user_id
          AND delivery_type = 'subscription'
          AND deleted_at IS NULL
      )
        AND NOT EXISTS (
          SELECT 1
          FROM notifications
          WHERE post_id = $6
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
    [recipientIds, title, body, displayUsername, targetPath, post.id],
  )

  return rows
}

export async function prunePostNotificationsExceptRecipients(
  postId: string,
  isContentEligible: boolean,
  isManualSendContentEligible: boolean,
  client: PoolClient,
  recipientTable: string,
): Promise<number> {
  const prunedForContentVisibility = await reconcilePostContentNotificationVisibility(
    postId,
    isContentEligible,
    isManualSendContentEligible,
    client,
  )
  if (!isContentEligible) return prunedForContentVisibility

  const { rowCount } = await client.query(
    `/* prunePostNotificationsExceptRecipients */
    UPDATE notifications n
    SET deleted_at = CURRENT_TIMESTAMP,
        delete_reason = 'system_pruned'
    WHERE n.post_id = $1
      AND n.delivery_type = 'subscription'
      AND n.deleted_at IS NULL
      AND n.read_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM ${recipientTable} recipients
        WHERE recipients.user_id = n.user_id
      )
  `,
    [postId],
  )
  return prunedForContentVisibility + (rowCount ?? 0)
}
