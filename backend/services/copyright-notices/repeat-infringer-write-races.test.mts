import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  createTestRepeatInfringerNotice,
  readTestRepeatInfringerAccountState,
  readTestRepeatInfringerDisposition,
  readTestRepeatInfringerIncidents,
  readTestRepeatInfringerOpenReviewIds,
  readTestRepeatInfringerReviewIdentityIds,
} from '@voucha/test-helpers/copyright-repeat-infringer'
import { raceConcurrentRepeatInfringerOpenReviewsForTest } from '@voucha/test-helpers/copyright-repeat-infringer-race'
import {
  beforePostgresTransactionQueryForTest,
  rewritePostgresTransactionRowsForTest,
} from '@voucha/test-helpers/injected-postgres-transactions'
import { observeTestPostgresClientQueries } from '@voucha/test-helpers/postgres-query-pool-observer'
import { confirmTestRepeatInfringerNotice } from '@voucha/test-helpers/services/copyright-notices/repeat-infringer'
import { completeCopyrightMandatoryHumanReview } from './human-review.mts'
import { recordCopyrightRepeatInfringerDisposition } from './repeat-infringer-incidents.mts'
import {
  recordCopyrightRepeatInfringerReinstatement,
  recordCopyrightRepeatInfringerReviewOutcome,
} from './repeat-infringer-outcomes.mts'

async function raceRepeatInfringerWrites<Result>(input: {
  first: () => Promise<Result>
  second: () => Promise<Result>
  id: string
  firstWrite: string
  secondQuery: string
  firstId?: string
}) {
  let contender: Promise<[PromiseSettledResult<Result>]> | undefined
  try {
    const { result } = await observeTestPostgresClientQueries(input.first, async query => {
      if (
        contender ||
        !query.text.includes(input.firstWrite) ||
        !query.values.includes(input.firstId ?? input.id)
      )
        return
      // Hold the first write open until the second session reaches its named statement.
      const started = Promise.withResolvers<void>()
      const restore = beforePostgresTransactionQueryForTest(
        input.secondQuery,
        values => values.includes(input.id),
        async () => started.resolve(),
      )
      try {
        contender = Promise.allSettled([input.second()] as const)
        await Promise.race([
          started.promise,
          contender.then(() => {
            throw new Error('Second writer did not reach its statement')
          }),
        ])
      } finally {
        restore()
      }
    })
    if (!contender) throw new Error('First writer did not reach its statement')
    const [second] = await contender
    return { first: result, second }
  } finally {
    await contender
  }
}

describe('repeat-infringer conditional decision writes', () => {
  it('records one disposition when two sessions decide the same incident', async () => {
    const [poster, moderator] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
    ])
    const noticeId = await confirmTestRepeatInfringerNotice(poster.id, moderator)
    const [incident] = await readTestRepeatInfringerIncidents(poster.id)
    if (!incident) throw new Error('Expected the confirmed incident')
    const decide = (disposition: 'withdrawn' | 'duplicate') =>
      recordCopyrightRepeatInfringerDisposition({
        currentUser: moderator,
        incidentId: incident.id,
        disposition,
        rationale: 'Staff confirmed the incident should stop counting.',
        recordedAt: new Date(),
      })
    const { second } = await raceRepeatInfringerWrites({
      first: () => decide('withdrawn'),
      second: () => decide('duplicate'),
      id: noticeId,
      firstId: incident.id,
      firstWrite: '/* recordCopyrightRepeatInfringerDisposition:current */',
      secondQuery: '/* lockCopyrightNoticeForLegalWrite */',
    })
    expect(second).toMatchObject({ status: 'rejected', reason: { status: 409 } })
    await expect(readTestRepeatInfringerIncidents(poster.id)).resolves.toEqual([
      expect.objectContaining({ id: incident.id, is_operative: false }),
    ])
  })

  it('rejects an already-set disposition at the write when the pre-read is stale', async () => {
    const [poster, moderator] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
    ])
    await confirmTestRepeatInfringerNotice(poster.id, moderator)
    const [incident] = await readTestRepeatInfringerIncidents(poster.id)
    if (!incident) throw new Error('Expected the confirmed incident')
    const input = {
      currentUser: moderator,
      incidentId: incident.id,
      rationale: 'Staff confirmed the incident should stop counting.',
      recordedAt: new Date(),
    }
    await recordCopyrightRepeatInfringerDisposition({ ...input, disposition: 'withdrawn' })

    // Only the pre-read is stale. The UPDATE still sees the committed withdrawal in PostgreSQL.
    const restore = rewritePostgresTransactionRowsForTest(
      '/* recordCopyrightRepeatInfringerDisposition */',
      values => values.includes(incident.id),
      rows => rows.map(row => ({ ...row, current_disposition: null })),
    )
    try {
      await expect(
        recordCopyrightRepeatInfringerDisposition({ ...input, disposition: 'duplicate' }),
      ).rejects.toMatchObject({ status: 409 })
    } finally {
      restore()
    }
    await expect(readTestRepeatInfringerDisposition(incident.id)).resolves.toEqual({
      current_disposition: 'withdrawn',
      is_operative: false,
      history: ['withdrawn'],
    })
  })

  it('rejects the second reinstatement after it has seen an effective termination', async () => {
    const [poster, moderator, admin] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser({ administrator: true }),
    ])
    await confirmTestRepeatInfringerNotice(poster.id, moderator)
    await confirmTestRepeatInfringerNotice(poster.id, moderator)
    const [reviewId] = await readTestRepeatInfringerOpenReviewIds(poster.id)
    if (!reviewId) throw new Error('Expected an open repeat-infringer review')
    await recordCopyrightRepeatInfringerReviewOutcome({
      currentUser: admin,
      reviewId,
      outcome: 'terminate',
      rationale: 'Two confirmed incidents remain operative.',
      recordedAt: new Date(),
    })
    const reinstate = (rationale: string) =>
      recordCopyrightRepeatInfringerReinstatement({
        accountUserId: poster.id,
        currentUser: admin,
        rationale,
        recordedAt: new Date(),
      })
    const { first, second } = await raceRepeatInfringerWrites({
      first: () => reinstate('The account may return.'),
      second: () => reinstate('Another reinstatement was requested.'),
      id: poster.id,
      firstWrite: '/* recordCopyrightRepeatInfringerReinstatement:current */',
      secondQuery: '/* recordCopyrightRepeatInfringerReinstatement:current */',
    })
    expect(first).toEqual({ account_user_id: poster.id, outcome: 'reinstatement' })
    expect(second).toMatchObject({ status: 'rejected', reason: { status: 409 } })
    await expect(readTestRepeatInfringerAccountState(poster.id)).resolves.toMatchObject({
      is_termination_in_effect: false,
      current_outcome: 'reinstatement',
    })
  })

  it('opens one review and leaves one identity row when two syncs race on a new account state', async () => {
    const [poster, moderator] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
    ])
    await confirmTestRepeatInfringerNotice(poster.id, moderator)
    const [secondNotice, thirdNotice] = await Promise.all([
      createTestRepeatInfringerNotice([poster.id], moderator),
      createTestRepeatInfringerNotice([poster.id], moderator),
    ])
    const confirm = (notice: { noticeId: string; restrictions: Array<{ id: string }> }) =>
      completeCopyrightMandatoryHumanReview({
        noticeId: notice.noticeId,
        restrictionId: notice.restrictions[0]!.id,
        currentUser: moderator,
        action: 'confirm',
        rationale: 'Confirmed restriction triggers repeat-infringer review sync.',
        reviewedAt: new Date(),
      })

    await raceConcurrentRepeatInfringerOpenReviewsForTest(
      poster.id,
      () => confirm(secondNotice),
      () => confirm(thirdNotice),
    )

    const openReviewIds = await readTestRepeatInfringerOpenReviewIds(poster.id)
    expect(openReviewIds).toHaveLength(1)
    expect(await readTestRepeatInfringerReviewIdentityIds(poster.id)).toEqual(openReviewIds)
  })

  it('opens one review and leaves no orphan identity when two syncs race after a decided review', async () => {
    const [poster, moderator] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
    ])
    await confirmTestRepeatInfringerNotice(poster.id, moderator)
    await confirmTestRepeatInfringerNotice(poster.id, moderator)
    const [firstReviewId] = await readTestRepeatInfringerOpenReviewIds(poster.id)
    if (!firstReviewId) throw new Error('Expected an open repeat-infringer review')
    await recordCopyrightRepeatInfringerReviewOutcome({
      currentUser: moderator,
      reviewId: firstReviewId,
      outcome: 'warning',
      rationale: 'Warned account remains eligible if later syncs run.',
      recordedAt: new Date(),
    })

    const [thirdNotice, fourthNotice] = await Promise.all([
      createTestRepeatInfringerNotice([poster.id], moderator),
      createTestRepeatInfringerNotice([poster.id], moderator),
    ])
    const confirm = (notice: { noticeId: string; restrictions: Array<{ id: string }> }) =>
      completeCopyrightMandatoryHumanReview({
        noticeId: notice.noticeId,
        restrictionId: notice.restrictions[0]!.id,
        currentUser: moderator,
        action: 'confirm',
        rationale: 'Confirmed restriction triggers repeat-infringer review sync.',
        reviewedAt: new Date(),
      })

    await raceConcurrentRepeatInfringerOpenReviewsForTest(
      poster.id,
      () => confirm(thirdNotice),
      () => confirm(fourthNotice),
    )

    const openReviewIds = await readTestRepeatInfringerOpenReviewIds(poster.id)
    expect(openReviewIds).toHaveLength(1)
    expect(await readTestRepeatInfringerReviewIdentityIds(poster.id)).toEqual(
      [firstReviewId, openReviewIds[0]!].toSorted(),
    )
  })

  it('opens nothing at one operative incident, opens at two, and does not reopen an open review', async () => {
    const [poster, moderator] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
    ])
    await confirmTestRepeatInfringerNotice(poster.id, moderator)
    expect(await readTestRepeatInfringerOpenReviewIds(poster.id)).toEqual([])
    expect(await readTestRepeatInfringerReviewIdentityIds(poster.id)).toEqual([])

    await confirmTestRepeatInfringerNotice(poster.id, moderator)
    const openAfterSecond = await readTestRepeatInfringerOpenReviewIds(poster.id)
    expect(openAfterSecond).toHaveLength(1)
    expect(await readTestRepeatInfringerReviewIdentityIds(poster.id)).toEqual(openAfterSecond)

    await confirmTestRepeatInfringerNotice(poster.id, moderator)
    expect(await readTestRepeatInfringerOpenReviewIds(poster.id)).toEqual(openAfterSecond)
    expect(await readTestRepeatInfringerReviewIdentityIds(poster.id)).toEqual(openAfterSecond)
  })
})
