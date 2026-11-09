import assert from 'node:assert/strict'
import { extractQueryName, getCapturedQueries, write } from '@data-stores/psql'
import { openModmailThread } from '@services/modmail/threads'
import { registerScenarioContract } from '../plan-expectations.mts'
import { seedUuid } from '../seed-data/common.mts'
import { heavyFollowUser, runAndCapture, seedUser } from '../run-support.mts'

const STAFF_COUNT = 40
const communityId = seedUuid(540_000, 'e9')

/** The opening cost is independent of how many moderators can see the staff queue. */
export async function runModmailOpeningScenario(): Promise<void> {
  const staffIds = Array.from({ length: STAFF_COUNT }, (_, i) => seedUuid(100 + i, '01'))
  await write(
    `/* seedExplainModmailCommunity */
    INSERT INTO communities (id, name, slug, created_by_id, created_via)
    VALUES ($1, 'EXPLAIN modmail community', 'explain-modmail-option-a', $2, 'system')
    ON CONFLICT (id) DO NOTHING`,
    [communityId, seedUser.id],
  )
  await write(
    `/* seedExplainModmailStaff */
    INSERT INTO community_members (community_id, user_id, role)
    SELECT $1::uuid, user_id,
      (CASE WHEN user_id = $3::uuid THEN 'owner' ELSE 'moderator' END)::community_member_roles
    FROM unnest($2::uuid[]) AS staff(user_id)
    ON CONFLICT DO NOTHING`,
    [communityId, [seedUser.id, ...staffIds], seedUser.id],
  )
  let conversationId: string | undefined
  registerScenarioContract('modmail-opening-two-parties', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'conversation_participants', max: 8 },
      { kind: 'maxProcessedRows', relation: 'community_members', max: 0 },
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
      'modmail-opening-two-parties',
      async () => {
        const thread = await openModmailThread(seedUser.id, communityId, heavyFollowUser.id)
        conversationId = thread.id
        const names = getCapturedQueries().map(query => extractQueryName(query.text))
        assert.equal(names.filter(name => name === 'admitConversationParticipants').length, 1)
        assert.ok(
          !getCapturedQueries().some(query => /\bcommunity_members\b/i.test(query.text)),
          'Opening must not read the moderator roster',
        )
        const { rows } = await write<{ user_id: string }>(
          `/* verifyExplainModmailOpening */
        SELECT user_id FROM conversation_participants WHERE conversation_id = $1::uuid ORDER BY user_id`,
          [thread.id],
        )
        assert.deepEqual(
          rows.map(row => row.user_id),
          [seedUser.id, heavyFollowUser.id].toSorted(),
        )
      },
      undefined,
      'admitConversationParticipants',
      {
        afterCapture: async () => {
          await write(
            '/* resetExplainModmailParticipants */ DELETE FROM conversation_participants WHERE conversation_id = $1::uuid',
            [conversationId],
          )
        },
      },
    )
  } finally {
    if (conversationId)
      await write('/* cleanupExplainModmail */ DELETE FROM conversations WHERE id = $1::uuid', [
        conversationId,
      ])
  }
}
