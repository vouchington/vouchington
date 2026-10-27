import type { PoolClient } from '@data-stores/psql'
import onError from '@modules/on-error'
import {
  type ReconcileNotificationsOptions,
  type ReconcileNotificationsResult,
  type RecipientPage,
  reconcileNotificationBatches,
} from './reconcile-batches.mts'
import { insertPostNotificationsForRecipients } from './reconcile-post-writes.mts'
import {
  getPostNotificationSnapshot,
  type PostNotificationSnapshot,
} from './reconcile-post-snapshot.mts'
import { POST_NOTIFICATION_RECIPIENT_VISIBILITY } from './reconcile-post-recipient-visibility.mts'
import { POST_NOTIFICATION_RECIPIENT_COMMUNITY_VISIBILITY } from './reconcile-post-recipient-community-visibility.mts'
import {
  reconcilePostContentNotificationVisibility,
  type ContentVisibilityCursor,
  type ContentVisibilityPage,
} from './content-visibility-writes.mts'
import { reconcileMembershipNotificationVisibility } from './membership-visibility-writes.mts'

type ReconcilePostNotificationsResult = ReconcileNotificationsResult
export async function reconcileNotificationsForPost(
  postId: string,
  options: ReconcileNotificationsOptions = {},
): Promise<ReconcilePostNotificationsResult> {
  try {
    const post = await getPostNotificationSnapshot(postId)
    if (!post) {
      const visibility = await reconcilePostContentNotificationVisibility(postId)
      return { created: 0, pruned: visibility.pruned, nextVisibilityCursor: visibility.nextCursor }
    }

    const reconciled = await reconcileNotificationBatches(
      {
        batchQueryComment: 'selectPostNotificationRecipientBatch',
        createRecipients: (client, recipientTable, page) =>
          populatePostNotificationRecipients(client, recipientTable, post, page),
        insertBatch: (client, recipientIds, createdTable) =>
          insertPostNotificationsForRecipients(post, recipientIds, client, createdTable),
      },
      options,
    )
    if (options.afterUserId) return reconciled
    const visibility = await reconcilePostContentNotificationVisibility(postId)
    const membership = await reconcilePostMembershipVisibility(postId)
    return {
      ...reconciled,
      pruned: reconciled.pruned + visibility.pruned + membership.pruned,
      nextVisibilityCursor: visibility.nextCursor,
      nextMembershipCursor: membership.nextCursor,
    }
  } catch (err) {
    if (err instanceof Error) {
      const enrichedError = err as Error & {
        tags?: Record<string, string | number | boolean>
        extra?: Record<string, unknown>
      }
      enrichedError.tags = {
        service: 'notifications',
        operation: 'reconcileNotificationsForPost',
      }
      enrichedError.extra = { postId }
      onError(enrichedError)
    }
    throw err
  }
}

/** A membership continuation reads source and recipient eligibility again for its target page. */
export async function reconcilePostMembershipVisibility(
  postId: string,
  after?: ContentVisibilityCursor,
): Promise<ContentVisibilityPage> {
  const post = await getPostNotificationSnapshot(postId)
  if (!post) return { updated: 0, pruned: 0 }
  return reconcileMembershipNotificationVisibility({
    kind: 'post',
    entityId: postId,
    eligible: post.is_content_eligible,
    after,
    populateRecipients: (client, table, userIds) =>
      populatePostNotificationRecipients(
        client,
        table,
        post,
        { afterUserId: null, limit: userIds.length },
        userIds,
      ),
  })
}

async function populatePostNotificationRecipients(
  client: PoolClient,
  recipientTable: string,
  post: PostNotificationSnapshot,
  page: RecipientPage,
  targetUserIds?: string[],
): Promise<void> {
  if (!post.is_content_eligible) return
  const targetSubjectFilter = targetUserIds ? 'AND rel.subject_id = ANY($13::uuid[])' : ''

  await client.query(
    `/* populatePostNotificationRecipients */
    WITH recipients AS (
      SELECT rel.subject_id AS user_id
      FROM relation__user__subscribe__post rel
      WHERE rel.object_id = $1
        ${targetSubjectFilter}
        AND $2 = 'comment'
        AND rel.created_at <= $3
        AND (
          rel.deleted_at IS NULL
          OR rel.deleted_at > $3
        )

      UNION
      SELECT rel.subject_id AS user_id
      FROM relation__user__subscribe__user rel
      WHERE rel.object_id = $4
        ${targetSubjectFilter}
        AND rel.created_at <= $3
        AND (
          rel.deleted_at IS NULL
          OR rel.deleted_at > $3
        )
        AND $2 != 'comment'
        AND NOT $5::boolean

      UNION
      SELECT rel.subject_id AS user_id
      FROM relation__post__category__topic post_topic
      JOIN relation__user__subscribe_posts__topic rel
        ON rel.object_id = post_topic.object_id
      WHERE post_topic.subject_id = $6
        ${targetSubjectFilter}
        AND post_topic.deleted_at IS NULL
        AND post_topic.votes_score_net > 0
        AND $7 = 'approve'
        AND rel.created_at <= $3
        AND (
          rel.deleted_at IS NULL
          OR rel.deleted_at > $3
        )

      UNION
      SELECT rel.subject_id AS user_id
      FROM relation__post__category__topic_alias post_alias
      JOIN topic_aliases alias
        ON alias.id = post_alias.object_id
      JOIN topics topic
        ON topic.id = alias.topic_id
        AND topic.deleted_at IS NULL
      JOIN relation__user__subscribe_posts__topic rel
        ON rel.object_id = alias.topic_id
      WHERE post_alias.subject_id = $6
        ${targetSubjectFilter}
        AND post_alias.deleted_at IS NULL
        AND post_alias.votes_score_net > 0
        AND $7 = 'approve'
        AND rel.created_at <= $3
        AND (
          rel.deleted_at IS NULL
          OR rel.deleted_at > $3
        )
    )
    INSERT INTO ${recipientTable} (user_id)
    SELECT DISTINCT user_id
    FROM recipients
    WHERE user_id IS NOT NULL
      AND ($4::uuid IS NULL OR user_id != $4)
      AND ($11::uuid IS NULL OR user_id > $11)
      AND ${POST_NOTIFICATION_RECIPIENT_VISIBILITY}
      AND ${POST_NOTIFICATION_RECIPIENT_COMMUNITY_VISIBILITY}
    -- no-mistakes: deadlock-safe -- random session-private temp table has no schema catalog entry.
    ORDER BY user_id
    LIMIT $12
    ON CONFLICT (user_id) DO NOTHING
  `,
    [
      post.parent_post_id,
      post.post_type,
      post.created_at,
      post.created_by_id,
      post.is_anonymous,
      post.id,
      post.clearance_status,
      post.root_created_by_id,
      post.root_privacy,
      post.root_broadcast,
      page.afterUserId,
      page.limit,
      ...(targetUserIds ? [targetUserIds] : []),
    ],
  )
}
