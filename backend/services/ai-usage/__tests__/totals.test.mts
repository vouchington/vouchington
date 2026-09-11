import { beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import {
  acquireTestAiUsageDateReservation,
  createTestUser,
  insertTestAiUsageRecord,
  insertTestCommunity,
} from '@voucha/test-helpers'
import { encodeCursor } from '@modules/pagination'
import { timestampToUuidv7LowerBound } from '@data-stores/psql/config-driven/utils/partition-utils'
import { MAX_MONEY_AMOUNT } from '@ts-shared/money'
import type { PrivateUser } from '@services/users/types'
import { getCommunityAiCostTotals } from '../totals.mts'

describe('getCommunityAiCostTotals', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('paginates cost-descending totals without duplicates using the UUID tie-breaker', async () => {
    const reservation = await acquireTestAiUsageDateReservation()
    onTestFinished(() => reservation.release())
    const day = reservation.day
    const dayStartMs = Date.parse(`${day}T00:00:00.000Z`)
    const tiedCost = String(MAX_MONEY_AMOUNT - 101)
    const nextCost = String(MAX_MONEY_AMOUNT - 102)
    const communities = await Promise.all([
      insertTestCommunity({ createdById: user.id }),
      insertTestCommunity({ createdById: user.id }),
      insertTestCommunity({ createdById: user.id }),
    ])
    await Promise.all([
      insertTestAiUsageRecord({
        id: timestampToUuidv7LowerBound(dayStartMs),
        communityId: communities[0]!.id,
        costMicrounits: tiedCost,
      }),
      insertTestAiUsageRecord({
        id: timestampToUuidv7LowerBound(dayStartMs + 1),
        communityId: communities[1]!.id,
        costMicrounits: tiedCost,
      }),
      insertTestAiUsageRecord({
        id: timestampToUuidv7LowerBound(dayStartMs + 2),
        communityId: communities[2]!.id,
        costMicrounits: nextCost,
      }),
    ])

    const tiedIds = communities
      .slice(0, 2)
      .map(community => community.id)
      .sort()
    const afterFirstTied = encodeCursor({
      total_cost_microunits: tiedCost,
      id: tiedIds[0],
    })
    const secondPage = await getCommunityAiCostTotals({ limit: 100, after: afterFirstTied })
    expect(secondPage.results[0]).toMatchObject({
      community_id: tiedIds[1],
      total_cost: { amount: tiedCost },
    })
    expect(secondPage.results.some(result => result.community_id === communities[2]!.id)).toBe(true)
    expect(new Set(secondPage.results.map(result => result.community_id)).size).toBe(
      secondPage.results.length,
    )
  })

  it('preserves and paginates a same-community total above the JSON-safe maximum', async () => {
    const reservation = await acquireTestAiUsageDateReservation()
    onTestFinished(() => reservation.release())
    const day = reservation.day
    const dayStartMs = Date.parse(`${day}T00:00:00.000Z`)
    const community = await insertTestCommunity({ createdById: user.id })
    const lowerCostCommunity = await insertTestCommunity({ createdById: user.id })
    await Promise.all([
      insertTestAiUsageRecord({
        id: timestampToUuidv7LowerBound(dayStartMs),
        communityId: community.id,
        costMicrounits: MAX_MONEY_AMOUNT,
      }),
      insertTestAiUsageRecord({
        id: timestampToUuidv7LowerBound(dayStartMs + 1),
        communityId: lowerCostCommunity.id,
        costMicrounits: 1,
      }),
      insertTestAiUsageRecord({
        id: timestampToUuidv7LowerBound(dayStartMs + 2),
        communityId: community.id,
        costMicrounits: MAX_MONEY_AMOUNT,
      }),
    ])

    const page = await getCommunityAiCostTotals({ limit: 100 })
    expect(page.results.find(result => result.community_id === community.id)).toMatchObject({
      community_id: community.id,
      total_cost: {
        amount: '18014398509481982',
        currency: 'usd',
        scale: 6,
      },
    })
    // lowerCostCommunity's cost (1 microunit) sits near the bottom of the DESC ranking, so it can
    // tie with -- and sort past -- however many ambient-pollution communities have accumulated
    // between it and `community`'s near-MAX_MONEY_AMOUNT total. Walk the cursor instead of assuming
    // it lands in the single page immediately after `community`.
    let after: string | undefined = encodeCursor({
      total_cost_microunits: '18014398509481982',
      id: community.id,
    })
    let found = false
    for (;;) {
      const nextPage = await getCommunityAiCostTotals({ limit: 100, after })
      found = nextPage.results.some(result => result.community_id === lowerCostCommunity.id)
      if (found || !nextPage.page_info.has_next_page) break
      after = nextPage.page_info.end_cursor ?? undefined
    }
    expect(found).toBe(true)
  })

  it.each([
    ['malformed encoding', 'not-a-cursor'],
    ['old UUID-only shape', encodeCursor({ id: '01234567-89ab-7def-8123-456789abcdef' })],
    [
      'non-canonical microunit amount',
      encodeCursor({
        total_cost_microunits: '01',
        id: '01234567-89ab-7def-8123-456789abcdef',
      }),
    ],
    ['invalid UUID tie-breaker', encodeCursor({ total_cost_microunits: '1', id: 'not-a-uuid' })],
  ])('rejects an invalid cursor with %s', async (_description, after) => {
    await expect(getCommunityAiCostTotals({ after })).rejects.toMatchObject({ status: 400 })
  })

  it('accepts a canonical cursor amount above the JSON-safe maximum', async () => {
    const after = encodeCursor({
      total_cost_microunits: '99999999999999999999999999999999999999999999999999',
      id: '01234567-89ab-7def-8123-456789abcdef',
    })

    await expect(getCommunityAiCostTotals({ after })).resolves.toBeDefined()
  })
})
