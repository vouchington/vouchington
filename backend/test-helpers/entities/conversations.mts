import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

type CreateTestConversationOptions = {
  createdById: string
  title?: string
  postId?: string
}

type CreateTestDirectConversationOptions = {
  user1Id: string
  user2Id: string
  updatedAt?: string
}

export async function createTestDirectConversation(options: CreateTestDirectConversationOptions) {
  const insert = options.updatedAt
    ? sql`/* createTestDirectConversation */
        INSERT INTO conversations (channel_type, title, created_by_id, updated_at)
        VALUES ('direct_message', '', ${options.user1Id}, ${options.updatedAt})
        RETURNING id`
    : sql`/* createTestDirectConversation */
        INSERT INTO conversations (channel_type, title, created_by_id)
        VALUES ('direct_message', '', ${options.user1Id})
        RETURNING id`
  const { rows: convRows } = await write(insert)
  const conversationId = convRows[0].id as string

  await write(sql`/* createTestDirectConversation:participants */
    INSERT INTO conversation_participants (conversation_id, user_id, role)
    VALUES
      (${conversationId}, ${options.user1Id}, 'owner'),
      (${conversationId}, ${options.user2Id}, 'member')
  `)

  return { id: conversationId }
}

type CreateTestDirectMessageOptions = {
  conversationId: string
  createdById: string
  bodyText: string
}

export async function createTestDirectMessage(options: CreateTestDirectMessageOptions) {
  const { rows } = await write(sql`/* createTestDirectMessage */
    INSERT INTO conversation_messages (conversation_id, kind, body_text, created_by_id)
    VALUES (${options.conversationId}, 'message', ${options.bodyText}, ${options.createdById})
    RETURNING id
  `)
  return { id: rows[0].id as string }
}

export async function createTestConversation(options: CreateTestConversationOptions) {
  const title = options.title ?? 'Test Conversation'

  const query = sql`
    INSERT INTO conversations (created_by_id, title`
  if (options.postId) {
    query.append(sql`, post_id`)
  }
  query.append(sql`)
    VALUES (${options.createdById}, ${title}`)
  if (options.postId) {
    query.append(sql`, ${options.postId}`)
  }
  query.append(sql`)
    RETURNING id`)

  const { rows } = await write(query)
  const conversation = rows[0]

  return { id: conversation.id as string }
}

type CreateTestConversationMessageOptions = {
  conversationId: string
  createdById: string
  content: unknown
}

type CreateTestModmailThreadOptions = {
  communityId: string
  subjectUserId: string
  modUserId: string
  updatedAt?: string
}

export async function createTestModmailThread(options: CreateTestModmailThreadOptions) {
  const insert = options.updatedAt
    ? sql`/* createTestModmailThread */
        INSERT INTO conversations (
          channel_type, title, community_id, subject_user_id, created_by_id, updated_at
        )
        VALUES (
          'modmail', '', ${options.communityId}, ${options.subjectUserId}, ${options.subjectUserId}, ${options.updatedAt}
        )
        RETURNING id`
    : sql`/* createTestModmailThread */
        INSERT INTO conversations (
          channel_type, title, community_id, subject_user_id, created_by_id
        )
        VALUES (
          'modmail', '', ${options.communityId}, ${options.subjectUserId}, ${options.subjectUserId}
        )
        RETURNING id`
  const { rows: convRows } = await write(insert)
  const conversationId = convRows[0].id as string

  await write(sql`/* createTestModmailThread:participants */
    INSERT INTO conversation_participants (conversation_id, user_id, role)
    VALUES
      (${conversationId}, ${options.subjectUserId}, 'member'),
      (${conversationId}, ${options.modUserId}, 'admin')
  `)

  return { id: conversationId }
}

export async function createTestConversationMessage(options: CreateTestConversationMessageOptions) {
  const { rows } = await write(sql`
    INSERT INTO conversation_messages (conversation_id, created_by_id, content)
    VALUES (${options.conversationId}, ${options.createdById}, ${JSON.stringify(options.content)})
    RETURNING id
  `)
  return { id: rows[0].id as string }
}

type TestConversationParticipant = {
  user_id: string
  role: string
}

export async function getTestConversationParticipants(
  conversationId: string,
): Promise<TestConversationParticipant[]> {
  const { rows } = await write(sql`/* getTestConversationParticipants */
    SELECT user_id, role FROM conversation_participants
    WHERE conversation_id = ${conversationId} AND removed_at IS NULL
  `)
  return rows as TestConversationParticipant[]
}

type GetTestConversationThreadFields = {
  assigned_mod_id: string | null
  assigned_at: Date | null
  resolved_at: Date | null
  resolved_by_id: string | null
}

type CreateTestGroupConversationOptions = {
  createdById: string
  memberUserIds: string[]
}

export async function createTestGroupConversation(options: CreateTestGroupConversationOptions) {
  const { rows: convRows } = await write(sql`/* createTestGroupConversation */
    INSERT INTO conversations (channel_type, title, created_by_id)
    VALUES ('direct_message', '', ${options.createdById})
    RETURNING id
  `)
  const conversationId = convRows[0].id as string

  const insertSql = sql`/* createTestGroupConversation:participants */
    INSERT INTO conversation_participants (conversation_id, user_id, role)
    VALUES (${conversationId}, ${options.createdById}, 'owner')`
  for (const memberId of options.memberUserIds) {
    insertSql.append(sql`, (${conversationId}, ${memberId}, 'member')`)
  }
  await write(insertSql)

  return { id: conversationId }
}

export async function removeTestConversationParticipant(
  conversationId: string,
  userId: string,
): Promise<void> {
  await write(sql`/* removeTestConversationParticipant */
    UPDATE conversation_participants
    SET removed_at = CURRENT_TIMESTAMP, removed_by_id = ${userId}
    WHERE conversation_id = ${conversationId}
      AND user_id = ${userId}
      AND removed_at IS NULL
  `)
}

export async function getTestConversationThreadFields(
  conversationId: string,
): Promise<GetTestConversationThreadFields> {
  const { rows } = await write(sql`/* getTestConversationThreadFields */
    SELECT assigned_mod_id, assigned_at, resolved_at, resolved_by_id
    FROM conversations WHERE id = ${conversationId}
  `)
  return rows[0] as GetTestConversationThreadFields
}
