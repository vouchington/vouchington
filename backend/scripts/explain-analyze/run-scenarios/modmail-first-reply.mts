import assert from 'node:assert/strict'
import { extractQueryName, getCapturedQueries, write } from '@data-stores/psql'
import { openModmailThread } from '@services/modmail/threads'
import { loadModmailReplyAccess, replyToModmailThread } from '@services/modmail/member-actions'
import { getPrivateUserByAny } from '@services/users/get'
import {
  CONVERSATION_PARTICIPANT_HARD_MAX,
  conversationParticipantLimitsConfig,
  getConversationParticipantLimit,
} from '@services/messaging/participant-limits'
import { registerScenarioContract } from '../plan-expectations.mts'
import { seedUuid } from '../seed-data/common.mts'
import { heavyFollowUser, runAndCapture, seedUser } from '../run-support.mts'

const communityId = seedUuid(540_000, 'e9')

/** A first staff reply consumes the final configured slot in the message transaction. */
export async function runModmailFirstReplyScenario(): Promise<void> {
  await conversationParticipantLimitsConfig.waitForInitialization()
  const limit = getConversationParticipantLimit()
  assert.ok(limit >= 3, 'The first-reply fixture needs two parties and one available slot')
  const thread = await openModmailThread(seedUser.id, communityId, heavyFollowUser.id)
  const moderatorId = seedUuid(100, '01')
  const moderator = await getPrivateUserByAny(moderatorId, { readOnly: false })
  assert.ok(moderator)
  const additional = Array.from({ length: limit - 3 }, (_, index) => seedUuid(index + 2, '01'))
  await write(
    `/* seedExplainModmailFirstReply */
    INSERT INTO conversation_participants (conversation_id, user_id, role, participant_slot)
    SELECT $1::uuid, user_id, 'member'::conversation_participant_roles, (ordinal + 2)::smallint
    FROM unnest($2::uuid[]) WITH ORDINALITY AS fixture(user_id, ordinal)
    ON CONFLICT DO NOTHING`,
    [thread.id, additional],
  )
  const access = await loadModmailReplyAccess(moderator, communityId, thread.id)
  assert.equal(access.isMod, true)
  let messageId: string | undefined
  registerScenarioContract('modmail-first-reply-last-slot', {
    expectations: [
      // The admission scans at most one hard-capped census and one hard-capped slot probe.
      {
        kind: 'maxProcessedRows',
        relation: 'conversation_participants',
        max: 2 * CONVERSATION_PARTICIPANT_HARD_MAX + 2,
      },
      { kind: 'maxProcessedRows', relation: 'conversations', max: 1 },
      { kind: 'maxProcessedRows', relation: 'community_members', max: 1 },
      {
        kind: 'usesIndexes',
        indexes: [
          'idx_conversation_participants__conversation_user',
          'idx_conversation_participants__conversation_slot',
        ],
        queryContains: 'reactivated',
      },
    ],
  })
  try {
    await runAndCapture(
      'modmail-first-reply-last-slot',
      async () => {
        const message = await replyToModmailThread(
          moderator,
          access,
          { createdVia: 'system', oauthClientId: null },
          'EXPLAIN first reply',
        )
        messageId = message.id
        const names = getCapturedQueries().map(query => extractQueryName(query.text))
        assert.equal(names.filter(name => name === 'admitConversationParticipants').length, 1)
        assert.equal(names.filter(name => name === 'replyToModmailThread:current').length, 1)
        const { rows } = await write<{ count: number }>(
          `/* verifyExplainModmailFirstReply */
        SELECT count(*)::integer AS count FROM conversation_participants WHERE conversation_id = $1::uuid`,
          [thread.id],
        )
        assert.equal(rows[0]?.count, limit)
      },
      undefined,
      ['replyToModmailThread:current', 'admitConversationParticipants'],
      {
        afterCapture: async () => {
          if (messageId)
            await write(
              '/* resetExplainModmailMessage */ DELETE FROM conversation_messages WHERE conversation_id = $1::uuid AND id = $2::uuid',
              [thread.id, messageId],
            )
          await write(
            '/* resetExplainModmailSender */ DELETE FROM conversation_participants WHERE conversation_id = $1::uuid AND user_id = $2::uuid',
            [thread.id, moderatorId],
          )
        },
      },
    )
  } finally {
    await write(
      '/* cleanupExplainModmailFirstReply */ DELETE FROM conversations WHERE id = $1::uuid',
      [thread.id],
    )
  }
}
