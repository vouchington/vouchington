import { describe, expect, it } from 'vitest'
import { createTestUserDirect, softDeleteUser } from '@voucha/test-helpers'
import {
  confirmTestRepeatInfringerNoticesConcurrently,
  confirmTestRepeatInfringerRestriction,
  createTestRepeatInfringerNotice,
  readTestRepeatInfringerOpenReviewIds,
  reviewTestRepeatInfringerAppeal,
} from '@voucha/test-helpers/copyright-repeat-infringer'
import type { PrivateUser } from '@services/users/types'
import {
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
