import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  createTestUserDirect,
  insertTestTopic,
  insertTestPost,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestModerationReport,
  insertTestReportIntegrityFlag,
  getTestReportAbusePenaltiesByFlagId,
  insertTestPostVote,
  getTestPenaltiesByFlagId,
  insertTestUserModNote,
  createTestAgent,
  insertTestAgentPrompt,
  insertTestAgentModeration,
  getPostLLMModerations,
} from '@voucha/test-helpers'
import {
  readReportStaffClaims,
  readStaffActionHistory,
  readStaffActionTarget,
  withRejectedStaffActionHistory,
} from '@voucha/test-helpers/staff-action-history'
import { createTopicClaim } from '../topic-claims/create.mts'
import { adminVerifyTopicClaim, rejectTopicClaim } from '../topic-claims/admin-verify.mts'
import { revokeTopicClaim } from '../topic-claims/revoke.mts'
import {
  claimModerationQueueItem,
  releaseModerationQueueItem,
} from '../moderation-claims/index.mts'
import {
  escalateModerationQueueItem,
  deEscalateModerationQueueItem,
} from '../moderation-threads/escalate.mts'
import { resolveReportIntegrityFlag } from '../report-integrity/resolve-flag.mts'
import { applyReportAbusePenalty } from '../report-integrity/apply-penalty.mts'
import { revokeReportAbusePenalty } from '../report-integrity/revoke-penalty.mts'
import { createVoteIntegrityFlag } from '../vote-integrity/create-flag.mts'
import { resolveVoteIntegrityFlag } from '../vote-integrity/resolve-flag.mts'
import { applyVoteRingPenalty } from '../vote-integrity/apply-ring-penalty.mts'
import { revokeVoteWeightPenalty } from '../vote-integrity/revoke-penalty.mts'
import { adminSetVoteWeight, adminClearVoteWeight } from '../vote-weight/admin-set.mts'
import { gatherVoteWeightFactors } from '../vote-weight/gather-factors.mts'
import { deleteUserModNote } from '../user-mod-notes/delete.mts'
import {
  upsertAgentModerationElectionVotes,
  getAgentModerationElectionVote,
} from '../elections-votes/agent-moderation/index.mts'

async function provesAtomicHistory(
  actorId: string,
  action: string,
  mutate: () => Promise<unknown>,
  readState: () => Promise<unknown>,
) {
  const before = await readState()
  const historyBefore = await readStaffActionHistory(actorId)
  await withRejectedStaffActionHistory(actorId, async () => {
    await expect(mutate()).rejects.toThrow('staff history rejected for test')
  })
  expect(await readState()).toEqual(before)
  expect(await readStaffActionHistory(actorId)).toEqual(historyBefore)
  await mutate()
  const historyAfter = await readStaffActionHistory(actorId)
  expect(historyAfter).toHaveLength(historyBefore.length + 1)
  expect(historyAfter.at(-1)).toMatchObject({ action_type: action })
}

function post(userId: string, communityId?: string) {
  return insertTestPost({
    createdById: userId,
    slug: `staff-history-${crypto.randomUUID()}`,
    title: 'Staff history',
    markdown: 'Synthetic content',
    communityId,
  })
}

describe('moderation staff history transactions', () => {
  it.each(['verify', 'reject', 'revoke'] as const)(
    'atomically records topic claim %s',
    async action => {
      expect.hasAssertions()
      const actor = await createTestUserDirect()
      const user = await createTestUserDirect()
      const topicId = await insertTestTopic({
        createdById: user.id,
        name: `Claim ${crypto.randomUUID()}`,
        slug: `claim-${crypto.randomUUID()}`,
      })
      const { claim } = await createTopicClaim(user.id, {
        topicId,
        claimedRole: 'Issuer',
        evidence: 'Synthetic proof',
      })
      if (action === 'revoke') await adminVerifyTopicClaim(user.id, claim.id)
      await provesAtomicHistory(
        actor.id,
        `topic_claim_${action}`,
        () =>
          action === 'verify'
            ? adminVerifyTopicClaim(actor.id, claim.id)
            : action === 'reject'
              ? rejectTopicClaim(actor.id, claim.id, 'Synthetic rejection')
              : revokeTopicClaim(actor.id, claim.id, 'Synthetic revocation'),
        () => readStaffActionTarget('topic_claim', claim.id),
      )
    },
  )

  it.each(['claim', 'unclaim', 'escalate', 'deescalate'] as const)(
    'atomically records report %s',
    async action => {
      expect.hasAssertions()
      const actor = await createTestUserDirect()
      const user = await createTestUserDirect()
      const community = await insertTestCommunity({ createdById: actor.id })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: actor.id,
        role: 'owner',
      })
      const postId = await post(user.id, community.id)
      const reportId = await insertTestModerationReport({
        reporterUserId: user.id,
        entityType: 'post',
        entityId: postId,
      })
      const options = { communityId: community.id, reportId }
      if (action === 'unclaim') await claimModerationQueueItem(actor.id, options)
      if (action === 'deescalate') await escalateModerationQueueItem(actor.id, options)
      await provesAtomicHistory(
        actor.id,
        `report_${action}`,
        () =>
          action === 'claim'
            ? claimModerationQueueItem(actor.id, options)
            : action === 'unclaim'
              ? releaseModerationQueueItem(actor.id, options)
              : action === 'escalate'
                ? escalateModerationQueueItem(actor.id, options)
                : deEscalateModerationQueueItem(actor.id, options),
        async () => ({
          report: await readStaffActionTarget('report', reportId),
          claims: await readReportStaffClaims(reportId),
        }),
      )
    },
  )

  it.each(['review', 'apply', 'revoke'] as const)(
    'atomically records report integrity %s',
    async action => {
      expect.hasAssertions()
      const actor = await createTestUserDirect()
      const user = await createTestUserDirect()
      const reporter = await createTestUserDirect()
      const flagId = await insertTestReportIntegrityFlag({
        reportedUserId: user.id,
        reporterUserIds: [reporter.id],
      })
      let penaltyId: string | undefined
      if (action === 'revoke')
        penaltyId = (await applyReportAbusePenalty(user.id, flagId)).penalties[0]!.id
      await provesAtomicHistory(
        actor.id,
        action === 'review' ? 'report_integrity_flag_review' : `report_integrity_penalty_${action}`,
        () =>
          action === 'review'
            ? resolveReportIntegrityFlag(flagId, actor.id, 'dismissed')
            : action === 'apply'
              ? applyReportAbusePenalty(actor.id, flagId)
              : revokeReportAbusePenalty(actor.id, penaltyId!),
        async () => ({
          flag: await readStaffActionTarget('report_flag', flagId),
          penalties: await getTestReportAbusePenaltiesByFlagId(flagId),
        }),
      )
    },
  )

  it.each(['review', 'apply', 'revoke'] as const)(
    'atomically records vote integrity %s',
    async action => {
      expect.hasAssertions()
      const actor = await createTestUserDirect()
      const user = await createTestUserDirect()
      const postId = await post(user.id)
      await insertTestPostVote(postId, user.id, '192.0.2.10', 1)
      const flag = await createVoteIntegrityFlag('post', postId, 'ip_correlation', {})
      let penaltyId: string | undefined
      if (action === 'revoke') {
        await applyVoteRingPenalty(flag!.id, user.id)
        penaltyId = (await getTestPenaltiesByFlagId(flag!.id))[0]!.id
      }
      await provesAtomicHistory(
        actor.id,
        action === 'review' ? 'vote_integrity_flag_review' : `vote_integrity_penalty_${action}`,
        () =>
          action === 'review'
            ? resolveVoteIntegrityFlag(flag!.id, actor.id, 'dismissed')
            : action === 'apply'
              ? applyVoteRingPenalty(flag!.id, actor.id)
              : revokeVoteWeightPenalty(penaltyId!, actor.id),
        async () => ({
          flag: await readStaffActionTarget('vote_flag', flag!.id),
          penalties: await getTestPenaltiesByFlagId(flag!.id),
        }),
      )
    },
  )

  it.each(['set', 'reset'] as const)(
    'atomically records vote weight %s and retains previous weight',
    async action => {
      expect.hasAssertions()
      const actor = await createTestUserDirect()
      const user = await createTestUserDirect()
      await adminSetVoteWeight(user.id, user.id, 3)
      await provesAtomicHistory(
        actor.id,
        `vote_weight_${action}`,
        () =>
          action === 'set'
            ? adminSetVoteWeight(actor.id, user.id, 7)
            : adminClearVoteWeight(actor.id, user.id),
        () => gatherVoteWeightFactors(user.id),
      )
      expect((await readStaffActionHistory(actor.id))[0]!.metadata).toMatchObject({
        before: { vote_weight: 3 },
      })
    },
  )

  it('atomically deletes a mod note and retains its body', async () => {
    expect.hasAssertions()
    const actor = await createTestUser({ administrator: true })
    const user = await createTestUserDirect()
    const noteId = await insertTestUserModNote({
      authorUserId: actor.id,
      targetUserId: user.id,
      body: 'Synthetic prior note',
    })
    await provesAtomicHistory(
      actor.id,
      'mod_note_delete',
      () => deleteUserModNote(actor, noteId, user.id),
      () => readStaffActionTarget('note', noteId),
    )
    expect((await readStaffActionHistory(actor.id))[0]!.metadata).toMatchObject({
      before: { body: 'Synthetic prior note' },
    })
  })

  it.each(['set', 'delete'] as const)(
    'atomically records agent moderation vote %s',
    async action => {
      expect.hasAssertions()
      const actor = await createTestUserDirect()
      const user = await createTestUserDirect()
      const agent = await createTestAgent({
        agentType: 'moderator',
        activated: true,
        slug: `history-${crypto.randomUUID()}`,
      })
      const promptId = await insertTestAgentPrompt({ agentId: agent.id, activated: true })
      const postId = await post(user.id)
      await insertTestAgentModeration({
        postId,
        promptId,
        agentId: agent.id,
        results: { flagged: false, reason: 'Synthetic' },
        flagged: false,
      })
      const moderationId = ((await getPostLLMModerations(postId)) as Array<{ id: string }>)[0]!.id
      if (action === 'delete')
        await upsertAgentModerationElectionVotes(actor.id, [{ entityId: moderationId, score: 1 }])
      await provesAtomicHistory(
        actor.id,
        `agent_moderation_vote_${action}`,
        () =>
          upsertAgentModerationElectionVotes(actor.id, [
            { entityId: moderationId, score: action === 'delete' ? null : 1 },
          ]),
        () => getAgentModerationElectionVote(actor.id, moderationId),
      )
    },
  )
})
