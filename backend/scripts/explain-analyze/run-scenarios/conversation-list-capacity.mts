import { write } from '@data-stores/psql'
import { createConversation, updateConversationTitle } from '@services/conversations-messages'
import sql from 'sql-template-strings'
import { getConversationsByCreatedById } from '../run-services.mts'
import { heavyFollowUser, runAndCapture, seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

const PAGE_SIZE = 100
const LIVE_CHATS = 160

export async function runConversationListCapacityScenario(): Promise<void> {
  // The shared corpus already includes the creator's 2,000 direct-message and modmail threads.
  const chatIds = Array.from({ length: LIVE_CHATS }, (_, index) => seedUuid(index, 'dc'))
  const deletedId = seedUuid(LIVE_CHATS, 'dc')
  const directMessageId = seedUuid(LIVE_CHATS + 1, 'dc')
  const otherCreatorId = seedUuid(LIVE_CHATS + 2, 'dc')
  const fixtureIds = [...chatIds, deletedId, directMessageId, otherCreatorId]
  const expectedIds = chatIds.toReversed().slice(0, PAGE_SIZE + 1)

  await write(sql`/* explainConversationListCapacityFixture */
    INSERT INTO conversations (id, created_by_id, channel_type, deleted_at)
    SELECT id, ${seedUser.id}::uuid, 'chat'::conversation_channel_types, NULL::timestamptz
    FROM unnest(${chatIds}::uuid[]) AS ids(id)
    UNION ALL
    VALUES
      (${deletedId}::uuid, ${seedUser.id}::uuid, 'chat'::conversation_channel_types, CURRENT_TIMESTAMP),
      (${directMessageId}::uuid, ${seedUser.id}::uuid, 'direct_message'::conversation_channel_types, NULL),
      (${otherCreatorId}::uuid, ${heavyFollowUser.id}::uuid, 'chat'::conversation_channel_types, NULL)
  `)
  try {
    await runAndCapture(
      'conversation-list-at-cap',
      async () => {
        const rows = await getConversationsByCreatedById(seedUser.id, { limit: PAGE_SIZE })
        if (
          rows.length !== expectedIds.length ||
          rows.some((row, index) => row.id !== expectedIds[index])
        ) {
          throw new Error(
            'The conversation list must return the newest 100 active chats and one lookahead',
          )
        }
      },
      undefined,
      'getConversationsByCreatedById',
      { exactCapturedNames: ['getConversationsByCreatedById'] },
    )
    await runChatConversationIndexWrites(chatIds[0]!)
  } finally {
    await write(sql`/* explainConversationListCapacityFixture */
      DELETE FROM conversations WHERE id = ANY(${fixtureIds}::uuid[])
    `)
  }
}

async function runChatConversationIndexWrites(conversationId: string): Promise<void> {
  const createTitle = 'Explain chat index create'
  const updatedTitle = 'Explain chat index retitle'
  const operations = ['createConversation', 'updateConversationTitle']
  let createdId: string | undefined

  try {
    await runAndCapture(
      'chat-conversation-index-writes',
      async () => {
        const created = await createConversation(seedUser.id, createTitle)
        createdId = created.id
        if (created.channel_type !== 'chat' || created.title !== createTitle) {
          throw new Error('The write benchmark must create an active chat')
        }
        const updated = await updateConversationTitle(conversationId, updatedTitle, seedUser.id)
        if (updated?.id !== conversationId || updated.title !== updatedTitle) {
          throw new Error('The write benchmark must retitle its seeded chat')
        }
      },
      undefined,
      operations,
      {
        exactCapturedNames: operations,
        afterCapture: async () => {
          await write(sql`/* restoreChatConversationIndexWriteFixture */
            UPDATE conversations SET title = '', updated_by_id = NULL
            WHERE id = ${conversationId}
          `)
        },
      },
    )
  } finally {
    if (createdId) {
      await write(sql`/* deleteChatConversationIndexWriteFixture */
        DELETE FROM conversations WHERE id = ${createdId}
      `)
    }
  }
}
