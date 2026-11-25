import { describe, expect, it } from 'vitest'
import { createTestTerritorialRestrictionScene } from '@voucha/test-helpers/copyright-territorial-restriction-fixtures'
import { beforePostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { observeTestPostgresClientQueries } from '@voucha/test-helpers/postgres-query-pool-observer'
import { recordEuCopyrightAcknowledgmentFailure } from './eu-acknowledgment.mts'
import { recordEuCopyrightStatementOfReasons } from './eu-reasons.mts'
import { recordEuCopyrightRedressDecision, submitEuCopyrightRedress } from './eu-redress.mts'

async function raceTerritorialWrites<Result>(
  noticeId: string,
  contenderMarker: string,
  first: () => Promise<Result>,
  second: () => Promise<Result>,
) {
  let contender: Promise<[PromiseSettledResult<Result>]> | undefined
  try {
    const { result } = await observeTestPostgresClientQueries(first, async query => {
      if (
        contender ||
        !query.text.includes('/* advanceCopyrightLastLegalActivityAt */') ||
        !query.values.includes(noticeId)
      )
        return
      // Keep the first write uncommitted until the second session reaches its first case query.
      const admission = Promise.withResolvers<void>()
      const restore = beforePostgresTransactionQueryForTest(
        contenderMarker,
        values => values.includes(noticeId),
        async () => admission.resolve(),
      )
      try {
        contender = Promise.allSettled([second()] as const)
        await Promise.race([
          admission.promise,
          contender.then(() => {
            throw new Error('Second writer ended before reaching its case query')
          }),
        ])
      } finally {
        restore()
      }
    })
    if (!contender) throw new Error('First writer did not reach the observed write')
    const [secondResult] = await contender
    return { first: result, second: secondResult }
  } finally {
    await contender
  }
}

describe('concurrent territorial copyright writes', () => {
  it('records one fifth acknowledgment failure and rejects the concurrent sixth attempt', async () => {
    const { staff, noticeId } = await createTestTerritorialRestrictionScene('eu_dsa')
    const fail = () => recordEuCopyrightAcknowledgmentFailure(staff, noticeId)
    await fail()
    await fail()
    await fail()
    await fail()
    const { first, second } = await raceTerritorialWrites(
      noticeId,
      '/* lockCopyrightNoticeForLegalWrite */',
      fail,
      fail,
    )
    expect(first).toMatchObject({ attempt_count: 5, escalated: true })
    expect(first.exhausted_at).toBeInstanceOf(Date)
    expect(second).toMatchObject({ status: 'rejected', reason: { status: 409 } })
    await expect(fail()).rejects.toMatchObject({ status: 409 })
  })

  it('records one staff decision when two sessions decide the same redress request', async () => {
    const { claimant, staff, noticeId } = await createTestTerritorialRestrictionScene('eu_dsa')
    await recordEuCopyrightStatementOfReasons(staff, noticeId, {
      text: 'Staff statement of reasons',
      publicExplanation: 'No action taken.',
      outcome: 'no_action',
      targets: [],
    })
    const redress = await submitEuCopyrightRedress(
      claimant,
      noticeId,
      crypto.randomUUID(),
      'Please review the decision.',
    )
    const decide = (disposition: 'maintain' | 'revoke') =>
      recordEuCopyrightRedressDecision(staff, noticeId, redress.id, {
        disposition,
        rationale: `Staff decision to ${disposition}.`,
      })
    const { first, second } = await raceTerritorialWrites(
      noticeId,
      '/* recordTerritorialCopyrightRedressDecision:request */',
      () => decide('maintain'),
      () => decide('revoke'),
    )
    expect(first.staff_disposition).toBe('maintain')
    expect(second).toMatchObject({ status: 'rejected', reason: { status: 409 } })
  })
})
