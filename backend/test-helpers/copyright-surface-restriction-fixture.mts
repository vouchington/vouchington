import { createTestUserDirect } from './entities/users.mts'
import {
  resolveCopyrightImagePlacement,
  type CopyrightImageSelector,
} from '../services/copyright-notices/placement-resolution.mts'
import { createCopyrightNoticeAggregate } from './services/copyright-notices/create-notice-aggregate.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { seedCopyrightSubmissionAssessment } from './copyright-notice-submissions.mts'
import { seedCopyrightStatementRestriction } from './copyright-statement-restriction-fixture.mts'

export async function seedTestCopyrightRestrictionForImage(
  selector: CopyrightImageSelector,
  at = new Date(),
) {
  const moderator = await createTestUserDirect({ extraRoles: ['moderator'] })
  const resolved = await resolveCopyrightImagePlacement(selector)
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: at,
    claimantUserId: null,
    claimantDisplayName: 'Test claimant',
    claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
    workDescription: `Test work ${crypto.randomUUID()}`,
    policyVersion: 'test-v1',
    initialSubmission: {
      kind: 'notice',
      sourceKind: 'email',
      bodyCiphertext: `body-${crypto.randomUUID()}`,
    },
    targets: [resolved],
  })
  const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
  if (!aggregate) throw new Error('Copyright case missing')
  const assessment = await seedCopyrightSubmissionAssessment({
    submissionId: aggregate.submissions[0]!.id,
    assessedAt: at,
    currentUser: moderator,
    substantiallyCompliant: true,
  })
  const restriction = await seedCopyrightStatementRestriction({
    noticeId: notice.id,
    targetId: aggregate.targets[0]!.id,
    assessmentId: assessment.id,
    imposedAt: at,
    moderatorId: moderator.id,
    revision: aggregate.targets[0]!.placement_revision,
    automated: false,
    reviewed: false,
  })
  const restricted = await getCopyrightNoticePrivateAggregate(notice.id)
  const withholdIntent = restricted?.actionIntents.find(intent => intent.action === 'withhold')
  if (!withholdIntent) throw new Error('Copyright withhold intent missing')
  return {
    noticeId: notice.id,
    targetId: aggregate.targets[0]!.id,
    restrictionId: restriction.id,
    moderator,
    withholdIntentId: withholdIntent.id,
  }
}
