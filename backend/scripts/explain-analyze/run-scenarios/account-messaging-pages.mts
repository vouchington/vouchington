import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { preciseTimestampPaginationParser, simplePaginationParser } from '@modules/pagination'
import { getConversationMessages, getConversationParticipants } from '@services/messaging/get'
import { getMyModmailThreads } from '@services/modmail/threads-get'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  deleteAccountMessagingFixture,
  seedAccountMessagingFixture,
} from './account-messaging-fixture.mts'

type Fixture = Awaited<ReturnType<typeof seedAccountMessagingFixture>>

async function captureModmailInbox(fixture: Fixture): Promise<void> {
  const scenario = 'account-modmail-threads-at-cap'
  const name = 'getMyModmailThreads'
  const limit = preciseTimestampPaginationParser.queryContract.limit.maximum
  registerScenarioContract(scenario, {
    expectations: [
      { kind: 'noSeqScan', relation: 'conversations' },
      {
        kind: 'usesIndexes',
        indexes: [
          'idx_conversations__subject_user_id',
          'idx_conversations__modmail_subject_activity',
        ],
        anyOf: true,
        noSort: true,
      },
      // The fixture's first page visits 101 visible threads plus six deleted threads.
      { kind: 'maxProcessedRows', relation: 'conversations', max: limit + 7 },
    ],
  })
  const { threadIds, communityId, subjectId } = fixture
  await runAndCapture(
    scenario,
    async () => {
      const first = await getMyModmailThreads(subjectId, { communityId, limit })
      assert.deepEqual(
        first.map(row => row.id),
        threadIds.slice(0, limit + 1),
      )
      const last = first[limit - 1]!
      assert.equal(last.cursor_timestamp, first[limit]?.cursor_timestamp)
      const next = await getMyModmailThreads(subjectId, {
        communityId,
        limit,
        after: { timestamp: last.cursor_timestamp, id: last.id },
      })
      assert.deepEqual(
        next.map(row => row.id),
        threadIds.slice(limit),
      )
      assert.ok(next.length > 0 && next.length < limit)
    },
    undefined,
    name,
    { exactCapturedNames: [name, name] },
  )
}

async function captureModmailTranscript(fixture: Fixture): Promise<void> {
  const scenario = 'account-modmail-messages-at-cap'
  const name = 'getConversationMessages'
  const limit = simplePaginationParser.queryContract.limit.maximum
  registerScenarioContract(scenario, {
    expectations: [
      { kind: 'singleLeaf', parent: 'conversation_messages', key: 'conversation_id' },
      { kind: 'maxProcessedRows', relation: 'conversation_messages', max: 240 },
    ],
  })
  const { transcriptId, messageIds } = fixture
  await runAndCapture(
    scenario,
    async () => {
      const first = await getConversationMessages(transcriptId, { limit })
      assert.deepEqual(
        first.map(row => row.id),
        messageIds.slice(-(limit + 1)),
      )
      // The modmail endpoint drops the lookahead at the head of the chronological result.
      const last = first[1]!
      const next = await getConversationMessages(transcriptId, { limit, after: { id: last.id } })
      assert.deepEqual(
        next.map(row => row.id),
        messageIds.slice(0, -limit),
      )
      assert.ok(next.length > 0 && next.length < limit)
    },
    undefined,
    name,
    { exactCapturedNames: [name, name] },
  )
}

async function captureParticipants(fixture: Fixture): Promise<void> {
  const scenario = 'account-conversation-participants-at-cap'
  const name = 'getConversationParticipants'
  const limit = 50
  registerScenarioContract(scenario, {
    expectations: [{ kind: 'maxProcessedRows', relation: 'conversation_participants', max: limit }],
  })
  const { participantConversationId, participants } = fixture
  await runAndCapture(
    scenario,
    async () => {
      const first = await getConversationParticipants(participantConversationId, { limit })
      const identity = (row: { id: string; user_id: string | null }) => [row.id, row.user_id]
      assert.equal(first.length, limit)
      assert.deepEqual(first.map(identity), participants.map(identity))
      assert.ok(first.every(row => row.conversation_id === participantConversationId))
      const smaller = await getConversationParticipants(participantConversationId, {
        limit: limit - 1,
      })
      assert.deepEqual(smaller.map(identity), participants.map(identity))
      const last = smaller[limit - 2]!
      const next = await getConversationParticipants(participantConversationId, {
        limit: limit - 1,
        after: { id: last.id },
      })
      assert.deepEqual(next.map(identity), participants.slice(-1).map(identity))
    },
    undefined,
    name,
    { exactCapturedNames: [name, name, name] },
  )
}

export async function runAccountMessagingScenarios(): Promise<void> {
  const fixture = await seedAccountMessagingFixture()
  try {
    await write(
      '/* analyzeAccountMessagingFixture */ ANALYZE conversations, conversation_messages, conversation_participants',
    )
    await captureModmailInbox(fixture)
    await captureModmailTranscript(fixture)
    await captureParticipants(fixture)
  } finally {
    await deleteAccountMessagingFixture(fixture)
  }
}
