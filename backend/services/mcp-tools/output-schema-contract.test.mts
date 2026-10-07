import { createTestUser } from '@voucha/test-helpers'
import { insertTestCard } from '@voucha/test-helpers/entities/cards'
import { insertTestRewardsProgram } from '@voucha/test-helpers/entities/rewards-programs'
import { insertTestRewardsProgramStatus } from '@voucha/test-helpers/entities/rewards-program-statuses'
import { insertTestSpendingCategory } from '@voucha/test-helpers/entities/spending-categories'
import manageMyCardsTool from '@voucha/mcp/manage-my-cards'
import manageMyPointValuationsTool from '@voucha/mcp/manage-my-point-valuations'
import manageMyRewardsStatusesTool from '@voucha/mcp/manage-my-rewards-statuses'
import manageMySpendingTool from '@voucha/mcp/manage-my-spending'
import updateMyFinancialProfileTool from '@voucha/mcp/update-my-financial-profile'
import type { PrivateUser } from '@services/users/types'
import { beforeAll, describe, expect, it } from 'vitest'
import { callMcpTool } from './call-tool.mts'
import { USER_MCP_SERVER_CONFIG } from './config.mts'

// Each converted tool returns real, fully populated service rows through the real call path, which
// checks them against the published output schema. A row the schema rejects becomes an error
// result here, so these tests fail when a service row and its REST contract drift apart.
describe('MCP output schema contract — real DB', () => {
  let user: PrivateUser & { membership_plan: null }

  async function call(caller: typeof user, name: string, scope: string) {
    const result = await callMcpTool(name, {}, caller, [scope] as never, USER_MCP_SERVER_CONFIG)
    expect(result.isError).toBeUndefined()
    const [block] = result.content as [{ type: 'text'; text: string }]
    expect(result.structuredContent).toEqual(JSON.parse(block.text))
    return result.structuredContent as Record<string, unknown>
  }

  beforeAll(async () => {
    user = { ...(await createTestUser()), membership_plan: null }
    const cardId = await insertTestCard({ createdById: user.id })
    const card = (await manageMyCardsTool.function(user)({ action: 'add', card_topic_id: cardId }))
      .result as { id: string }
    await manageMyCardsTool.function(user)({
      action: 'update',
      id: card.id,
      note: 'everyday card',
      opened_on: '2024-01-15',
      credit_limit: { amount: 50_000_000, currency: 'usd' },
    })
    await manageMyPointValuationsTool.function(user)({
      action: 'add',
      rewards_program_id: await insertTestRewardsProgram({ createdById: user.id }),
      value_per_point: { amount: 35_000, currency: 'usd', scale: 6 },
      note: 'cash-out value',
    })
    const status = (
      await manageMyRewardsStatusesTool.function(user)({
        action: 'add',
        rewards_program_status_topic_id: await insertTestRewardsProgramStatus({
          createdById: user.id,
        }),
      })
    ).result as { id: string }
    await manageMyRewardsStatusesTool.function(user)({
      action: 'update',
      id: status.id,
      started_on: '2024-01-01',
      expires_on: '2024-12-31',
    })
    await manageMySpendingTool.function(user)({
      action: 'add',
      spending_category_topic_id: await insertTestSpendingCategory({ createdById: user.id }),
      amount: { amount: 1_000_000, currency: 'usd' },
      spending_frequency: 'monthly',
      note: 'groceries',
    })
    await updateMyFinancialProfileTool.function(user)({
      currency: 'usd',
      credit_score_range: '740-799',
      stated_income_range: {
        minimum: { amount: 7_500_000, currency: 'usd' },
        maximum: { amount: 10_000_000, currency: 'usd' },
      },
      total_credit_limit: { amount: 50_000_000, currency: 'usd' },
      years_of_credit_history: 8,
    })
  })

  it.each([
    ['get_my_cards', 'cards:read'],
    ['get_my_point_valuations', 'point-valuations:read'],
    ['get_my_rewards_statuses', 'rewards-statuses:read'],
    ['get_my_spending', 'spending:read'],
  ])('returns populated %s rows that satisfy the published schema', async (name, scope) => {
    const structured = await call(user, name, scope)

    const { results } = structured['result'] as { results: unknown[] }
    expect(structured['success']).toBe(true)
    expect(results).toHaveLength(1)
  })

  it('returns a populated get_my_profile that satisfies the published schema', async () => {
    const structured = await call(user, 'get_my_profile', 'profile:read')

    expect(structured['cards']).toHaveLength(1)
    expect(structured['point_valuations']).toHaveLength(1)
    expect(structured['rewards_program_statuses']).toHaveLength(1)
    expect(structured).not.toHaveProperty('financial_profile')
    const financial = await call(user, 'get_my_financial_profile', 'financial-profile:read')
    expect(financial['result']).toMatchObject({
      financial_profile: { credit_score_range: '740-799' },
    })
  })

  it('returns get_my_profile for a user with no financial profile', async () => {
    const freshUser = { ...(await createTestUser()), membership_plan: null }

    const structured = await call(freshUser, 'get_my_profile', 'profile:read')

    expect(structured).not.toHaveProperty('financial_profile')
    const financial = await call(freshUser, 'get_my_financial_profile', 'financial-profile:read')
    expect(financial['result']).toMatchObject({ financial_profile: null })
    expect(structured['cards']).toEqual([])
  })
})
