import { readEffectiveReviewState } from '@voucha/test-helpers/copyright-effective-review-state'
import { describe, expect, it } from 'vitest'
import { createTestUser, createTestUserDirect, softDeleteUser } from '@voucha/test-helpers'
import {
  readTestRepeatInfringerIncidents,
  readTestRepeatInfringerOpenReviewIds,
} from '@voucha/test-helpers/copyright-repeat-infringer'
import { createEffectiveReviewNotice } from '@voucha/test-helpers/copyright-effective-review-fixtures'
import {
  seedEffectiveConfirmation,
  seedEffectiveReviewAppeal,
  seedEffectiveAppealDecision,
  seedEffectiveDisposition,
} from '@voucha/test-helpers/copyright-effective-review-decisions'
import {
  assertEffectiveAppeal,
  assertEffectiveConfirmation,
  assertEffectiveDisposition,
} from '@voucha/test-helpers/copyright-effective-review-subjects'
import { recordCopyrightRepeatInfringerReviewOutcome } from './repeat-infringer-outcomes.mts'
import { recordCopyrightRepeatInfringerDisposition } from './repeat-infringer-dispositions.mts'
import type { PrivateUser } from '@services/users/types'

async function createActors() {
  const [poster, otherPoster, moderator] = await Promise.all([
    createTestUserDirect(),
    createTestUserDirect(),
    createTestUser({ administrator: true }),
  ])
  return { poster, otherPoster, moderator }
}

describe('copyright effective incident authority', () => {
  it('opens one review after two distinct confirmations commit', async () => {
    expect.hasAssertions()
    const { poster, moderator } = await createActors()
    const first = await createEffectiveReviewNotice([poster.id], moderator)
    const second = await createEffectiveReviewNotice([poster.id], moderator)
    await seedEffectiveConfirmation(first.noticeId, first.restrictions[0]!.id, moderator)
    await assertEffectiveConfirmation(second, poster, moderator, { [poster.id]: true })
  })

  it('reverses only the deleted appealed account in a multi-owner notice', async () => {
    expect.hasAssertions()
    const { poster, otherPoster, moderator } = await createActors()
    const fixture = await createEffectiveReviewNotice([poster.id, otherPoster.id], moderator)
    await confirmAll(fixture, moderator)
    const appeal = await seedEffectiveReviewAppeal(
      fixture.noticeId,
      poster.id,
      fixture.restrictions[0]!.targetId,
    )
    await softDeleteUser(poster.id)
    await assertEffectiveAppeal(
      fixture,
      poster,
      moderator,
      'reverse',
      { [poster.id]: false },
      0,
      appeal.submission.id,
    )
  })

  it('creates an incident from a confirming appeal', async () => {
    expect.hasAssertions()
    const { poster, moderator } = await createActors()
    const fixture = await createEffectiveReviewNotice([poster.id], moderator)
    await assertEffectiveAppeal(fixture, poster, moderator, 'confirm', { [poster.id]: true })
  })

  it('keeps reversal dominant over later confirmation', async () => {
    expect.hasAssertions()
    const { poster, moderator } = await createActors()
    const fixture = await createEffectiveReviewNotice([poster.id], moderator)
    await confirmAll(fixture, moderator)
    await commitAppeal(fixture, poster, moderator, 'reverse')
    await assertEffectiveAppeal(fixture, poster, moderator, 'confirm', { [poster.id]: false })
  })

  it('does not create an is_operative incident for a deleted author', async () => {
    expect.hasAssertions()
    const { poster, moderator } = await createActors()
    const fixture = await createEffectiveReviewNotice([poster.id], moderator)
    await softDeleteUser(poster.id)
    await assertEffectiveConfirmation(fixture, poster, moderator, { [poster.id]: null })
  })

  it('excludes only the chosen incident', async () => {
    expect.hasAssertions()
    const { poster, otherPoster, moderator } = await createActors()
    const fixture = await createEffectiveReviewNotice([poster.id, otherPoster.id], moderator)
    await confirmAll(fixture, moderator)
    const [incident] = await readTestRepeatInfringerIncidents(poster.id)
    await assertEffectiveDisposition(fixture, poster, moderator, incident!.id)
  })

  it('rejects duplicate or missing dispositions after the decision commits', async () => {
    const { poster, moderator } = await createActors()
    const fixture = await createEffectiveReviewNotice([poster.id], moderator)
    await confirmAll(fixture, moderator)
    const [incident] = await readTestRepeatInfringerIncidents(poster.id)
    await seedEffectiveDisposition(incident!.id, fixture.noticeId, moderator)
    const before = await readEffectiveReviewState(fixture.noticeId, [poster.id])
    const input = {
      currentUser: moderator,
      incidentId: incident!.id,
      disposition: 'duplicate' as const,
      rationale: 'The case duplicates an earlier notice.',
      recordedAt: new Date(),
    }
    await expect(recordCopyrightRepeatInfringerDisposition(input)).rejects.toMatchObject({
      status: 409,
      message: 'Copyright repeat-infringer incident already has a disposition',
    })
    await expect(
      recordCopyrightRepeatInfringerDisposition({ ...input, incidentId: crypto.randomUUID() }),
    ).rejects.toMatchObject({
      status: 404,
      message: 'Copyright repeat-infringer incident not found',
    })
    expect(await readEffectiveReviewState(fixture.noticeId, [poster.id])).toEqual(before)
  })

  it('preserves an account incident supported by another confirmed target', async () => {
    expect.hasAssertions()
    const { poster, moderator } = await createActors()
    const fixture = await createEffectiveReviewNotice([poster.id, poster.id], moderator)
    await confirmAll(fixture, moderator)
    await assertEffectiveAppeal(fixture, poster, moderator, 'reverse', { [poster.id]: true })
  })

  it('keeps an initial reversal dominant over a confirming appeal', async () => {
    expect.hasAssertions()
    const { poster, moderator } = await createActors()
    const fixture = await createEffectiveReviewNotice([poster.id], moderator)
    await seedEffectiveConfirmation(
      fixture.noticeId,
      fixture.restrictions[0]!.id,
      moderator,
      'reverse',
    )
    await assertEffectiveAppeal(fixture, poster, moderator, 'confirm', { [poster.id]: null })
  })

  it('evaluates the threshold even when synchronization does not change an incident', async () => {
    expect.hasAssertions()
    const { poster, moderator } = await createActors()
    const { second } = await completedWarning(poster, moderator)
    await assertEffectiveAppeal(second, poster, moderator, 'confirm', { [poster.id]: true })
  })

  it('does not reopen a completed review after the account is deleted', async () => {
    expect.hasAssertions()
    const { poster, moderator } = await createActors()
    const first = await createEffectiveReviewNotice([poster.id], moderator)
    const second = await createEffectiveReviewNotice([poster.id], moderator)
    await confirmAll(first, moderator)
    await confirmAll(second, moderator)
    const appeal = await seedEffectiveReviewAppeal(
      first.noticeId,
      poster.id,
      first.restrictions[0]!.targetId,
    )
    const [reviewId] = await readTestRepeatInfringerOpenReviewIds(poster.id)
    await softDeleteUser(poster.id)
    await recordCopyrightRepeatInfringerReviewOutcome({
      currentUser: moderator,
      reviewId: reviewId!,
      outcome: 'warning',
      rationale: 'The retained review is complete.',
      recordedAt: new Date(),
    })
    await assertEffectiveAppeal(
      first,
      poster,
      moderator,
      'confirm',
      { [poster.id]: true },
      0,
      appeal.submission.id,
    )
  })

  it('retains the open review when reversal drops below two incidents', async () => {
    expect.hasAssertions()
    const { poster, moderator } = await createActors()
    const first = await createEffectiveReviewNotice([poster.id], moderator)
    const second = await createEffectiveReviewNotice([poster.id], moderator)
    await confirmAll(first, moderator)
    await confirmAll(second, moderator)
    await assertEffectiveAppeal(first, poster, moderator, 'reverse', { [poster.id]: false })
  })

  it('rejects enforcement after a committed reversal drops below two incidents', async () => {
    const { poster, moderator } = await createActors()
    const first = await createEffectiveReviewNotice([poster.id], moderator)
    const second = await createEffectiveReviewNotice([poster.id], moderator)
    await confirmAll(first, moderator)
    await confirmAll(second, moderator)
    const [reviewId] = await readTestRepeatInfringerOpenReviewIds(poster.id)
    await commitAppeal(first, poster, moderator, 'reverse')
    const before = await readEffectiveReviewState(first.noticeId, [poster.id])
    await expect(
      recordCopyrightRepeatInfringerReviewOutcome({
        currentUser: moderator,
        reviewId: reviewId!,
        outcome: 'restrict',
        rationale: 'The threshold must be checked again.',
        recordedAt: new Date(),
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Restrict and terminate require two is_operative incidents',
    })
    expect(await readTestRepeatInfringerOpenReviewIds(poster.id)).toEqual([reviewId])
    expect(await readEffectiveReviewState(first.noticeId, [poster.id])).toEqual(before)
  })
})

async function confirmAll(
  fixture: Awaited<ReturnType<typeof createEffectiveReviewNotice>>,
  moderator: PrivateUser,
) {
  for (const restriction of fixture.restrictions)
    await seedEffectiveConfirmation(fixture.noticeId, restriction.id, moderator)
}

async function commitAppeal(
  fixture: Awaited<ReturnType<typeof createEffectiveReviewNotice>>,
  poster: PrivateUser,
  moderator: PrivateUser,
  action: 'confirm' | 'reverse',
) {
  const restriction = fixture.restrictions[0]!
  const appeal = await seedEffectiveReviewAppeal(fixture.noticeId, poster.id, restriction.targetId)
  await seedEffectiveAppealDecision(
    {
      submissionId: appeal.submission.id,
      currentUser: moderator,
      recommendationId: null,
      manualFallbackReason: 'The record supports a manual review.',
      rationale: 'The evidence was reviewed.',
      decisions: [{ restrictionId: restriction.id, action }],
    },
    fixture.noticeId,
  )
}

async function completedWarning(poster: PrivateUser, moderator: PrivateUser) {
  const first = await createEffectiveReviewNotice([poster.id], moderator)
  const second = await createEffectiveReviewNotice([poster.id], moderator)
  await confirmAll(first, moderator)
  await confirmAll(second, moderator)
  const [reviewId] = await readTestRepeatInfringerOpenReviewIds(poster.id)
  await recordCopyrightRepeatInfringerReviewOutcome({
    currentUser: moderator,
    reviewId: reviewId!,
    outcome: 'warning',
    rationale: 'The first account review records a warning.',
    recordedAt: new Date(),
  })
  return { first, second }
}
