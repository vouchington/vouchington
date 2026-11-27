import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

type Inbox = {
  recipientId: string
  notifications: { id: string; read_at: Date | null }[]
  latePostId: string
}

export async function withNotificationInbox(
  counts: { unread: number; read?: number; backgroundRecipients: number },
  run: (inbox: Inbox) => Promise<void>,
): Promise<void> {
  const tag = `explain-notification-inbox-${randomUUID()}`
  const { recipientId, userIds, postIds, notifications } = await seedInbox(
    tag,
    counts.unread,
    counts.read ?? 0,
    counts.backgroundRecipients,
  )
  try {
    await run({ recipientId, notifications, latePostId: postIds.at(-1)! })
  } finally {
    await using query = await beginTransaction()
    await query(sql`/* cleanupExplainInboxNotifications */
      DELETE FROM notifications WHERE user_id = ANY(${userIds}::uuid[])`)
    await query(sql`/* cleanupExplainInboxPosts */
      DELETE FROM posts WHERE id = ANY(${postIds}::uuid[])`)
    await query(sql`/* cleanupExplainInboxPostIdentities */
      DELETE FROM retained_post_identities WHERE id = ANY(${postIds}::uuid[])`)
    await query(sql`/* cleanupExplainInboxRecipients */
      DELETE FROM users WHERE id = ANY(${userIds}::uuid[])`)
    await query(sql`/* cleanupExplainInboxRecipientIdentities */
      DELETE FROM retained_user_identities WHERE id = ANY(${userIds}::uuid[])`)
    await query.commit()
  }
}

async function seedInbox(
  tag: string,
  unreadCount: number,
  readCount: number,
  backgroundRecipients: number,
) {
  const backgroundNotifications = 500
  await using query = await beginTransaction()
  const { rows: users } = await query<{
    id: string
    username: string
  }>(sql`/* seedExplainInboxRecipients */
    INSERT INTO users (username)
    SELECT ${tag} || '-' || ordinal
    FROM generate_series(0, ${backgroundRecipients}::int) ordinal
    RETURNING id, username`)
  const recipientId = users.find(user => user.username === `${tag}-0`)!.id
  const userIds = users.map(user => user.id)
  const { rows: posts } = await query<{ id: string }>(sql`/* seedExplainInboxPosts */
    INSERT INTO posts (
      post_type, created_by_id, title, markdown, created_via, approved_at,
      bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256
    )
    SELECT 'discussion', ${recipientId}, 'Inbox fixture', 'Inbox fixture', 'system', CURRENT_TIMESTAMP,
      decode(repeat('00', 32), 'hex'), decode(repeat('00', 32), 'hex')
    FROM generate_series(1, ${Math.max(unreadCount + readCount, backgroundNotifications) + 1}::int)
    RETURNING id`)
  const postIds = posts.map(post => post.id)
  const { rows: notifications } = await query<
    Inbox['notifications'][number]
  >(sql`/* seedExplainInboxNotifications */
    WITH seeded AS (
      INSERT INTO notifications (user_id, entity_type, kind, post_id, target_path, read_at)
      SELECT recipient.id, 'post', 'post_new',
        (${postIds}::uuid[])[n], '/posts/explain-inbox',
        CASE WHEN recipient.id = ${recipientId}::uuid AND n > ${unreadCount}::int
          THEN CURRENT_TIMESTAMP END
      FROM unnest(${userIds}::uuid[]) recipient(id)
      CROSS JOIN generate_series(1, CASE WHEN recipient.id = ${recipientId}::uuid
        THEN ${unreadCount + readCount}::int ELSE ${backgroundNotifications}::int END) n
      ORDER BY recipient.id, n
      RETURNING id, user_id, read_at
    )
    SELECT id, read_at FROM seeded WHERE user_id = ${recipientId} ORDER BY id DESC`)
  await query.commit()
  return { recipientId, userIds, postIds, notifications }
}
