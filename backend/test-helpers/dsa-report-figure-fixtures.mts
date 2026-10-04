import { createTestUser } from './entities/users.mts'
import { createHostedImagePost } from './services/copyright-notices/hosted-post-audience.mts'
import { createTestCopyrightTrustedFlagger } from './copyright-trusted-flaggers.mts'
import {
  acknowledgeEuCopyrightNotice,
  receiveEuCopyrightNotice,
  recordCopyrightJurisdictionPolicyApproval,
  recordEuCopyrightStatementOfReasons,
} from '../services/copyright-notices/index.mts'

/** An actual EU receipt whose claimant designation is captured before filing. */
export async function createTestReportingTrustedEuCase(
  area: 'intellectual_property' | 'other',
  outcome: 'no_action' | 'restrict',
) {
  const post = await createHostedImagePost('public')
  const [administrator, staff] = await Promise.all([
    createTestUser({ administrator: true }),
    createTestUser({ extraRoles: ['moderator'] }),
  ])
  const suffix = crypto.randomUUID()
  await recordCopyrightJurisdictionPolicyApproval(administrator, {
    jurisdiction: 'eu_dsa',
    policyVersion: `eu-${suffix.replaceAll('-', '').slice(0, 12)}`,
  })
  await createTestCopyrightTrustedFlagger(administrator, post.claimant.id, area)
  const receipt = await receiveEuCopyrightNotice(
    { user: post.claimant, identity: `user:${post.claimant.id}` },
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
  await acknowledgeEuCopyrightNotice(post.claimant, receipt.notice_id)
  await recordEuCopyrightStatementOfReasons(staff, receipt.notice_id, {
    text: `Private assessment ${suffix}`,
    publicExplanation: `The identified image was reviewed ${suffix}.`,
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
  return { ...post, staff, noticeId: receipt.notice_id, suffix }
}
