import { write } from '@data-stores/psql'
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
  } finally {
    await write(sql`/* explainConversationListCapacityFixture */
      DELETE FROM conversations WHERE id = ANY(${fixtureIds}::uuid[])
    `)
  }
}
