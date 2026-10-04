import { createTestUser } from './entities/users.mts'
import { createHostedImagePost } from './services/copyright-notices/hosted-post-audience.mts'
import {
  acknowledgeEuCopyrightNotice,
  receiveEuCopyrightNotice,
  recordCopyrightJurisdictionPolicyApproval,
  recordEuCopyrightRedressDecision,
  recordEuCopyrightStatementOfReasons,
  submitEuCopyrightRedress,
} from '../services/copyright-notices/index.mts'

export async function createTestEuParticipantCase(
  outcome: 'pending' | 'no_action' | 'restrict' = 'restrict',
) {
  const post = await createHostedImagePost('public')
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
    await acknowledgeEuCopyrightNotice(notifier, receipt.notice_id)
    await recordEuCopyrightStatementOfReasons(staff, receipt.notice_id, {
      text: `Staff-only rationale ${suffix}`,
      publicExplanation: `Public explanation ${suffix}`,
      outcome,
      targets:
        outcome === 'restrict'
          ? [
              {
                surfaceKind: 'post-image',
                postId: post.postId,
                imageId: post.imageId,
                hostedUseUrl: `https://example.test/work/${suffix}`,
              },
            ]
          : [],
    })
  }
  return { ...post, notifier, staff, administrator, stranger, receipt, suffix }
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
