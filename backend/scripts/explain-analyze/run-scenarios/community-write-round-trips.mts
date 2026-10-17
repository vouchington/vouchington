import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { hashCommunityInviteCode } from '@services/communities/invites/code'
import { redeemInviteCode } from '@services/communities/invites/redeem'
import { setApplicationQuestions } from '@services/communities/applications/questions'
import { addConversationParticipant } from '@services/messaging'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

// The conversation row and its active participants come back in one read. The owner is already a
// participant, so the call stops at the duplicate check after that read.
export async function runParticipantRead(): Promise<void> {
  const { rows } = await read<{ conversation_id: string; user_id: string }>(
    `/* explainParticipantReadFixture */
      SELECT cp.conversation_id, cp.user_id
      FROM conversations c
      JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.removed_at IS NULL
      WHERE c.channel_type = 'direct_message'
        AND c.created_by_id = cp.user_id
      ORDER BY c.id
      LIMIT 1`,
  )
  const fixture = rows[0]
  if (!fixture) throw new Error('The participant scenario needs a seeded direct conversation')
  registerScenarioContract('conversation-participant-add-read', {
    expectations: [
      // Both modes read one conversation and its one participant; budgets add 20%.
      { kind: 'maxProcessedRows', relation: 'conversations', max: 2 },
      { kind: 'maxProcessedRows', relation: 'conversation_participants', max: 2 },
    ],
  })
  await runAndCapture(
    'conversation-participant-add-read',
    async () => {
      await addConversationParticipant(fixture.user_id, fixture.conversation_id, fixture.user_id)
        .then(() => {
          throw new Error('The owner is already a participant')
        })
        .catch((err: unknown) => {
          if ((err as { status?: number }).status !== 409) throw err
        })
    },
    undefined,
    'addConversationParticipant:participants',
  )
}

// A pending invite is accepted and its member added by one statement. The capture redeems the
// invite for real, so afterwards the fixture goes back to pending and the replay accepts it again
// inside its rolled-back transaction. The fixed code replaces the previous run's fixture.
export async function runInviteRedeem(communityId: string): Promise<void> {
  const { rows: invitees } = await read<{ id: string }>(
    sql`/* explainInviteeFixture */
      SELECT u.id FROM users u
      WHERE u.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM community_members m WHERE m.community_id = ${communityId} AND m.user_id = u.id
        )
      ORDER BY u.id
      LIMIT 1`,
  )
  const inviteeId = invitees[0]?.id
  if (!inviteeId) throw new Error('The invite scenario needs a user outside the seeded community')
  const code = 'explain-invite-fixture'
  const codeHash = hashCommunityInviteCode(code)
  await write(sql`/* explainInviteFixture */
    DELETE FROM community_invites WHERE code_hash = ${codeHash}`)
  const { rows } = await write<{ id: string }>(
    sql`/* explainInviteFixture */
      INSERT INTO community_invites (community_id, invited_by_id, invited_user_id, code_hash)
      VALUES (${communityId}, ${seedUser.id}, ${inviteeId}, ${codeHash})
      RETURNING id`,
  )
  registerScenarioContract('community-invite-redeem', {
    expectations: [
      // Both modes find one invite and one inviter membership; budgets add 20%.
      { kind: 'maxProcessedRows', relation: 'community_invites', max: 4 },
      { kind: 'maxProcessedRows', relation: 'community_members', max: 2 },
    ],
  })
  await runAndCapture(
    'community-invite-redeem',
    () => redeemInviteCode(inviteeId, code),
    undefined,
    'redeemInviteCode:accept',
    {
      afterCapture: async () => {
        await write(sql`/* explainInviteReset */
          DELETE FROM community_members WHERE community_id = ${communityId} AND user_id = ${inviteeId}`)
        await write(sql`/* explainInviteReset */
          UPDATE community_invites SET accepted_at = NULL, accepted_by_id = NULL
          WHERE id = ${rows[0]!.id}`)
      },
    },
  )
}

// The application form is replaced by one statement. The two fixture questions stay, so the
// replay retires them; the next run replaces them again.
export async function runApplicationQuestions(communityId: string): Promise<void> {
  registerScenarioContract('community-application-questions', {
    expectations: [
      // Both modes process six rows: two found, two retired, two inserted; budget adds 20%.
      { kind: 'maxProcessedRows', relation: 'community_application_questions', max: 8 },
    ],
  })
  await runAndCapture(
    'community-application-questions',
    () =>
      setApplicationQuestions(seedUser.id, communityId, [
        { question: 'Why join?', field_type: 'short_text' },
        { question: 'Tell us more', field_type: 'long_text' },
      ]),
    undefined,
    'setApplicationQuestions',
  )
}
