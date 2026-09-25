import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { getPrivateUserByAny } from '@services/users/get'
import type { PrivateUser } from '@services/users/types'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  appendCopyrightSubmissionAssessment,
  completeCopyrightMandatoryHumanReview,
  createCopyrightNoticeAggregate,
  getCopyrightNoticePrivateAggregate,
  getCopyrightRepeatInfringerAccount,
  recordCopyrightRepeatInfringerDisposition,
} from './index.mts'

async function confirmNotice(posterId: string, moderator: PrivateUser) {
  const postId = await insertTestPost({
    title: `repeat infringer ${crypto.randomUUID()}`,
    slug: `repeat-infringer-${crypto.randomUUID()}`,
    createdById: posterId,
    markdown: 'image',
  })
  const imageId = await insertTestImage(posterId)
  await insertTestPostImage({ postId, imageId })
  const placement = await getTestPostImagePlacement(postId, imageId)
  if (!placement) throw new Error('fixture image placement disappeared')
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: new Date('2026-06-30T16:00:00.000Z'),
    claimantUserId: null,
    claimantDisplayName: 'Claimant',
    claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
    workDescription: `work-${crypto.randomUUID()}`,
    policyVersion: 'test-v1',
    initialSubmission: {
      kind: 'notice',
      sourceKind: 'signed_in_form',
      bodyCiphertext: `notice-${crypto.randomUUID()}`,
    },
    targets: [
      {
        placementKey: `image-placement:${placement.placement_id}`,
        placementRevision: placement.placement_revision,
        imageId,
        hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
      },
    ],
  })
  const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
  if (!aggregate) throw new Error('fixture notice disappeared')
  const assessment = await appendCopyrightSubmissionAssessment({
    submissionId: aggregate.submissions[0].id,
    assessedAt: new Date('2026-07-01T11:00:00.000Z'),
    currentUser: moderator,
    substantiallyCompliant: true,
  })
  const restriction = await acceptCopyrightNoticeAndImposeRestriction({
    noticeId: notice.id,
    targetId: aggregate.targets[0].id,
    assessmentId: assessment.id,
    imposedAt: new Date('2026-07-01T12:00:00.000Z'),
    imposedById: null,
  })
  await completeCopyrightMandatoryHumanReview({
    noticeId: notice.id,
    restrictionId: restriction.id,
    currentUser: moderator,
    action: 'confirm',
    rationale: 'The restriction remains appropriate after review.',
    reviewedAt: new Date('2026-07-02T12:00:00.000Z'),
  })
  return notice.id
}

describe('copyright repeat-infringer incidents', () => {
  it('opens one review at the second confirmed notice and does not suspend the account', async () => {
    const [poster, moderatorRecord] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as PrivateUser
    const firstNoticeId = await confirmNotice(poster.id, moderator)
    const secondNoticeId = await confirmNotice(poster.id, moderator)

    const account = await getCopyrightRepeatInfringerAccount(poster.id)
    expect(
      account.incidents
        .filter(incident => incident.operative)
        .map(incident => incident.copyright_notice_id)
        .sort(),
    ).toEqual([firstNoticeId, secondNoticeId].sort())
    expect(account.open_review_id).toEqual(expect.any(String))
    await expect(getPrivateUserByAny(poster.id)).resolves.toEqual(
      expect.objectContaining({ suspended_at: null }),
    )

    const operative = account.incidents.find(
      incident => incident.copyright_notice_id === firstNoticeId,
    )
    if (!operative) throw new Error('first incident disappeared')
    await recordCopyrightRepeatInfringerDisposition({
      currentUser: moderator,
      incidentId: operative.id,
      disposition: 'duplicate',
      rationale: 'This notice duplicates an earlier confirmed case.',
      recordedAt: new Date('2026-07-03T12:00:00.000Z'),
    })
    const afterDisposition = await getCopyrightRepeatInfringerAccount(poster.id)
    expect(
      afterDisposition.incidents.find(incident => incident.id === operative.id)?.operative,
    ).toBe(false)
    await expect(getPrivateUserByAny(poster.id)).resolves.toEqual(
      expect.objectContaining({ suspended_at: null }),
    )
  })
})
