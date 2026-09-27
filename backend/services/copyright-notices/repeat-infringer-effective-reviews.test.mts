import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  softDeleteUser,
  getTestPostImagePlacement,
  insertTestPost,
  insertTestImage,
  insertTestPostImage,
} from '@voucha/test-helpers'
import {
  confirmTestRepeatInfringerNoticesConcurrently,
  readTestRepeatInfringerOpenReviewIds,
} from '@voucha/test-helpers/copyright-repeat-infringer'
import type { PrivateUser } from '@services/users/types'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  appendCopyrightSubmissionAssessment,
  createCopyrightAppeal,
  createCopyrightNoticeAggregate,
  getCopyrightNoticePrivateAggregate,
  reviewCopyrightAppeal,
  completeCopyrightMandatoryHumanReview,
  getCopyrightRepeatInfringerAccount,
  recordCopyrightRepeatInfringerDisposition,
  recordCopyrightRepeatInfringerReviewOutcome,
} from './index.mts'

async function createActors() {
  const [poster, otherPoster, moderatorRecord] = await Promise.all([
    createTestUserDirect(),
    createTestUserDirect(),
    createTestUserDirect(),
  ])
  return {
    poster,
    otherPoster,
    moderator: { ...moderatorRecord, roles: ['administrator'] } as PrivateUser,
  }
}

describe('copyright effective incident authority', () => {
  it('serializes two distinct confirmations into two incidents and one open review', async () => {
    const { poster, moderator } = await createActors()
    const [first, second] = await Promise.all([
      createTestRepeatInfringerNotice([poster.id], moderator),
      createTestRepeatInfringerNotice([poster.id], moderator),
    ])
    await confirmTestRepeatInfringerNoticesConcurrently(poster.id, [
      () => confirmTestRepeatInfringerRestriction(first, moderator),
      () => confirmTestRepeatInfringerRestriction(second, moderator),
    ])
    const account = await getCopyrightRepeatInfringerAccount(poster.id)
    expect(account.incidents.filter(row => row.operative)).toHaveLength(2)
    expect(await readTestRepeatInfringerOpenReviewIds(poster.id)).toEqual([account.open_review_id])
  })
  it('reverses only the appealed account in a multi-owner notice', async () => {
    const { poster, otherPoster, moderator } = await createActors()
    const fixture = await createTestRepeatInfringerNotice([poster.id, otherPoster.id], moderator)
    await confirmTestRepeatInfringerRestriction(fixture, moderator, 0)
    await confirmTestRepeatInfringerRestriction(fixture, moderator, 1)
    await reviewTestRepeatInfringerAppeal(fixture, poster, moderator, 'reverse')
    expect((await getCopyrightRepeatInfringerAccount(poster.id)).incidents).toEqual([
      expect.objectContaining({ copyright_notice_id: fixture.noticeId, operative: false }),
    ])
    expect((await getCopyrightRepeatInfringerAccount(otherPoster.id)).incidents).toEqual([
      expect.objectContaining({ copyright_notice_id: fixture.noticeId, operative: true }),
    ])
  })
  it('creates an incident from a confirming appeal', async () => {
    const { poster, moderator } = await createActors()
    const fixture = await createTestRepeatInfringerNotice([poster.id], moderator)
    await reviewTestRepeatInfringerAppeal(fixture, poster, moderator, 'confirm')
    expect((await getCopyrightRepeatInfringerAccount(poster.id)).incidents).toEqual([
      expect.objectContaining({ copyright_notice_id: fixture.noticeId, operative: true }),
    ])
  })
  it('keeps reversal dominant over later confirmation', async () => {
    const { poster, moderator } = await createActors()
    const fixture = await createTestRepeatInfringerNotice([poster.id], moderator)
    await confirmTestRepeatInfringerRestriction(fixture, moderator)
    await reviewTestRepeatInfringerAppeal(fixture, poster, moderator, 'reverse')
    await reviewTestRepeatInfringerAppeal(fixture, poster, moderator, 'confirm')
    expect((await getCopyrightRepeatInfringerAccount(poster.id)).incidents).toEqual([
      expect.objectContaining({ operative: false }),
    ])
  })
  it('does not create an operative incident for a deleted author', async () => {
    const { poster, moderator } = await createActors()
    const fixture = await createTestRepeatInfringerNotice([poster.id], moderator)
    await softDeleteUser(poster.id)
    await confirmTestRepeatInfringerRestriction(fixture, moderator)
    expect((await getCopyrightRepeatInfringerAccount(poster.id)).incidents).toEqual([])
  })
  it('excludes only the chosen incident and rejects duplicate or missing dispositions', async () => {
    const { poster, otherPoster, moderator } = await createActors()
    const fixture = await createTestRepeatInfringerNotice([poster.id, otherPoster.id], moderator)
    await confirmTestRepeatInfringerRestriction(fixture, moderator, 0)
    await confirmTestRepeatInfringerRestriction(fixture, moderator, 1)
    const before = await getCopyrightRepeatInfringerAccount(poster.id)
    const incident = before.incidents[0]!
    const input = {
      currentUser: moderator,
      incidentId: incident.id,
      disposition: 'duplicate' as const,
      rationale: 'The case duplicates an earlier notice.',
      recordedAt: new Date(),
    }
    await recordCopyrightRepeatInfringerDisposition(input)
    expect((await getCopyrightRepeatInfringerAccount(poster.id)).incidents).toEqual([
      expect.objectContaining({ id: incident.id, operative: false }),
    ])
    expect((await getCopyrightRepeatInfringerAccount(otherPoster.id)).incidents).toEqual([
      expect.objectContaining({ copyright_notice_id: fixture.noticeId, operative: true }),
    ])
    await expect(recordCopyrightRepeatInfringerDisposition(input)).rejects.toMatchObject({
      status: 409,
    })
    await expect(
      recordCopyrightRepeatInfringerDisposition({ ...input, incidentId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ status: 404 })
  })
  it('preserves an account incident supported by another confirmed target', async () => {
    const { poster, moderator } = await createActors()
    const fixture = await createTestRepeatInfringerNotice([poster.id, poster.id], moderator)
    await confirmTestRepeatInfringerRestriction(fixture, moderator, 0)
    await confirmTestRepeatInfringerRestriction(fixture, moderator, 1)
    await reviewTestRepeatInfringerAppeal(fixture, poster, moderator, 'reverse', 0)
    expect((await getCopyrightRepeatInfringerAccount(poster.id)).incidents).toEqual([
      expect.objectContaining({ copyright_notice_id: fixture.noticeId, operative: true }),
    ])
  })
  it('keeps an initial reversal dominant over a confirming appeal', async () => {
    const { poster, moderator } = await createActors()
    const fixture = await createTestRepeatInfringerNotice([poster.id], moderator)
    await completeCopyrightMandatoryHumanReview({
      currentUser: moderator,
      noticeId: fixture.noticeId,
      restrictionId: fixture.restrictions[0]!.id,
      action: 'reverse',
      rationale: 'The initial review reverses the restriction.',
      reviewedAt: new Date(),
    })
    await reviewTestRepeatInfringerAppeal(fixture, poster, moderator, 'confirm')
    expect((await getCopyrightRepeatInfringerAccount(poster.id)).incidents).toEqual([])
  })
  it('evaluates the threshold even when synchronization does not change an incident', async () => {
    const { poster, moderator } = await createActors()
    const first = await createTestRepeatInfringerNotice([poster.id], moderator)
    const second = await createTestRepeatInfringerNotice([poster.id], moderator)
    await confirmTestRepeatInfringerRestriction(first, moderator)
    await confirmTestRepeatInfringerRestriction(second, moderator)
    const before = await getCopyrightRepeatInfringerAccount(poster.id)
    await recordCopyrightRepeatInfringerReviewOutcome({
      currentUser: moderator,
      reviewId: before.open_review_id!,
      outcome: 'warning',
      rationale: 'The first account review records a warning.',
      recordedAt: new Date(),
    })
    await reviewTestRepeatInfringerAppeal(second, poster, moderator, 'confirm')
    const after = await getCopyrightRepeatInfringerAccount(poster.id)
    expect(after.incidents).toEqual(before.incidents)
    expect(after.open_review_id).toEqual(expect.any(String))
    expect(after.open_review_id).not.toBe(before.open_review_id)
    expect(await readTestRepeatInfringerOpenReviewIds(poster.id)).toEqual([after.open_review_id])
  })
  it('retains the open review but rejects enforcement after reversal drops below two', async () => {
    const { poster, moderator } = await createActors()
    const first = await createTestRepeatInfringerNotice([poster.id], moderator)
    const second = await createTestRepeatInfringerNotice([poster.id], moderator)
    await confirmTestRepeatInfringerRestriction(first, moderator)
    await confirmTestRepeatInfringerRestriction(second, moderator)
    const before = await getCopyrightRepeatInfringerAccount(poster.id)
    await reviewTestRepeatInfringerAppeal(first, poster, moderator, 'reverse')
    const after = await getCopyrightRepeatInfringerAccount(poster.id)
    expect(after.open_review_id).toBe(before.open_review_id)
    expect(after.incidents.filter(row => row.operative)).toHaveLength(1)
    await expect(
      recordCopyrightRepeatInfringerReviewOutcome({
        currentUser: moderator,
        reviewId: after.open_review_id!,
        outcome: 'restrict',
        rationale: 'The threshold must be checked again.',
        recordedAt: new Date(),
      }),
    ).rejects.toMatchObject({ status: 409 })
  })
})

async function createTestRepeatInfringerNotice(ownerIds: string[], moderator: PrivateUser) {
  const targets = await Promise.all(
    ownerIds.map(async ownerId => {
      const postId = await insertTestPost({
        title: `copyright ${crypto.randomUUID()}`,
        slug: `copyright-${crypto.randomUUID()}`,
        createdById: ownerId,
        markdown: 'image',
      })
      const imageId = await insertTestImage(ownerId)
      await insertTestPostImage({ postId, imageId })
      const placement = await getTestPostImagePlacement(postId, imageId)
      if (!placement) throw new Error('Test placement missing')
      return {
        placementKey: `image-placement:${placement.placement_id}`,
        placementRevision: placement.placement_revision,
        imageId,
        hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
      }
    }),
  )
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: new Date(),
    claimantUserId: null,
    claimantDisplayName: 'Claimant',
    claimantContactCiphertext: crypto.randomUUID(),
    workDescription: crypto.randomUUID(),
    policyVersion: 'test-v1',
    initialSubmission: {
      kind: 'notice',
      sourceKind: 'signed_in_form',
      bodyCiphertext: crypto.randomUUID(),
    },
    targets,
  })
  const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
  if (!aggregate) throw new Error('Test notice missing')
  const assessment = await appendCopyrightSubmissionAssessment({
    submissionId: aggregate.submissions[0]!.id,
    assessedAt: new Date(),
    currentUser: moderator,
    substantiallyCompliant: true,
  })
  const restrictions = []
  const targetsByPlacement = new Map(
    aggregate.targets.map(target => [target.placement_key, target]),
  )
  for (const target of targets) {
    const saved = targetsByPlacement.get(target.placementKey)
    if (!saved) throw new Error('Test target missing')
    const restriction = await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.id,
      targetId: saved.id,
      assessmentId: assessment.id,
      imposedAt: new Date(),
      imposedById: null,
    })
    restrictions.push({ id: restriction.id, targetId: saved.id })
  }
  return { noticeId: notice.id, restrictions }
}

async function confirmTestRepeatInfringerRestriction(
  fixture: Awaited<ReturnType<typeof createTestRepeatInfringerNotice>>,
  moderator: PrivateUser,
  index = 0,
) {
  return completeCopyrightMandatoryHumanReview({
    currentUser: moderator,
    noticeId: fixture.noticeId,
    restrictionId: fixture.restrictions[index]!.id,
    action: 'confirm',
    rationale: 'The reviewed restriction is appropriate.',
    reviewedAt: new Date(),
  })
}

async function reviewTestRepeatInfringerAppeal(
  fixture: Awaited<ReturnType<typeof createTestRepeatInfringerNotice>>,
  poster: PrivateUser,
  moderator: PrivateUser,
  action: 'confirm' | 'reverse',
  index = 0,
) {
  const restriction = fixture.restrictions[index]!
  const appeal = await createCopyrightAppeal(poster, fixture.noticeId, crypto.randomUUID(), {
    reason: 'Please review the restriction.',
    targetIds: [restriction.targetId],
  })
  return reviewCopyrightAppeal({
    submissionId: appeal.submission.id,
    currentUser: moderator,
    recommendationId: null,
    manualFallbackReason: 'The record supports a manual review.',
    rationale: 'The evidence was reviewed.',
    decisions: [{ restrictionId: restriction.id, action }],
  })
}
