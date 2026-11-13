import { seedCommittedEuParticipantDecision } from './copyright-eu-committed-decision.mts'
import { withTransactionOptions } from '@data-stores/psql'
import { selectStaffTerritorialCases } from '../services/copyright-notices/read-models-staff-territorial.mts'
import { createTestUser } from './entities/users.mts'
import { createHostedImagePost } from './services/copyright-notices/hosted-post-audience.mts'
import {
  receiveEuCopyrightNotice,
  recordCopyrightJurisdictionPolicyApproval,
  recordEuCopyrightRedressDecision,
  submitEuCopyrightRedress,
} from '../services/copyright-notices/index.mts'

export async function createTestEuParticipantCase(
  outcome: 'pending' | 'no_action' | 'restrict' = 'restrict',
  options: { extraPosts?: number; samePoster?: boolean } = {},
) {
  const post = await createHostedImagePost('public')
  const extraPosts = await Promise.all(
    Array.from({ length: options.extraPosts ?? 0 }, () =>
      createHostedImagePost('public', { poster: options.samePoster ? post.poster : undefined }),
    ),
  )
  const [notifier, staff, administrator, stranger] = await Promise.all([
    createTestUser(),
    createTestUser({ extraRoles: ['moderator'] }),
    createTestUser({ administrator: true }),
    createTestUser(),
  ])
  const suffix = crypto.randomUUID()
  await recordCopyrightJurisdictionPolicyApproval(administrator, {
    jurisdiction: 'eu_dsa',
    policyVersion: `eu-${suffix.replaceAll('-', '').slice(0, 12)}`,
  })
  const receipt = await receiveEuCopyrightNotice(
    { user: notifier, identity: `user:${notifier.id}` },
    crypto.randomUUID(),
    {
      notifierName: `Notifier ${suffix}`,
      notifierEmail: `notifier-${suffix}@example.test`,
      goodFaithStatement: true,
      contact: `Notifier contact ${suffix}`,
      contentDescription: `Work ${suffix}`,
      grounds: `Grounds ${suffix}`,
      hostedUseUrl: `https://example.test/work/${suffix}`,
    },
  )
  if (outcome !== 'pending') {
    await seedCommittedEuParticipantDecision(staff, receipt.notice_id, {
      text: `Staff-only rationale ${suffix}`,
      publicExplanation: `Public explanation ${suffix}`,
      outcome,
      targets:
        outcome === 'restrict'
          ? [post, ...extraPosts].map(hosted => ({
              surfaceKind: 'post-image' as const,
              postId: hosted.postId,
              imageId: hosted.imageId,
              hostedUseUrl: `https://example.test/work/${suffix}`,
            }))
          : [],
    })
  }
  return { ...post, extraPosts, notifier, staff, administrator, stranger, receipt, suffix }
}

export async function createTestEuParticipantComplaint(input: {
  noticeId: string
  actor: Parameters<typeof submitEuCopyrightRedress>[0]
  staff: Parameters<typeof recordEuCopyrightRedressDecision>[0]
  explanation: string
  rationale: string
  disposition?: 'maintain' | 'revoke'
}) {
  const request = await submitEuCopyrightRedress(
    input.actor,
    input.noticeId,
    crypto.randomUUID(),
    input.explanation,
  )
  const decision = await recordEuCopyrightRedressDecision(input.staff, input.noticeId, request.id, {
    disposition: input.disposition ?? 'maintain',
    rationale: input.rationale,
  })
  return { request, decision }
}

/** The staff review-queue territorial card of one notice, read through the real read model. */
export async function readStaffTerritorialCard(noticeId: string) {
  const cards = await withTransactionOptions({}, query =>
    selectStaffTerritorialCases([noticeId], query),
  )
  return cards.get(noticeId)
}
