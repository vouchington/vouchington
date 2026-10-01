import { createTestUser } from '@voucha/test-helpers'
import { insertTestCard } from '@voucha/test-helpers/entities/cards'
import { callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { insertTestRewardsProgram } from '@voucha/test-helpers/entities/rewards-programs'
import { insertTestRewardsProgramStatus } from '@voucha/test-helpers/entities/rewards-program-statuses'
import { insertTestSpendingCategory } from '@voucha/test-helpers/entities/spending-categories'
import type { ApiScope } from '@modules/scopes'
import type { PrivateUser } from '@services/users/types'
import { beforeAll, describe, expect, it } from 'vitest'

type ManageCase = {
  tool: string
  scopes: readonly ApiScope[]
  reader: { tool: string; scope: ApiScope }
  add: (user: PrivateUser) => Promise<Record<string, unknown>>
  update: Record<string, unknown>
}

const cases: readonly ManageCase[] = [
  {
    tool: 'manage_my_cards',
    scopes: ['cards:read', 'cards:write'],
    reader: { tool: 'get_my_cards', scope: 'cards:read' },
    add: async user => ({ card_id: await insertTestCard({ createdById: user.id }) }),
    update: {
      note: 'everyday card',
      opened_on: '2024-01-15',
      credit_limit: { amount: 50_000_000, currency: 'usd' },
    },
  },
  {
    tool: 'manage_my_point_valuations',
    scopes: ['point-valuations:read', 'point-valuations:write'],
    reader: { tool: 'get_my_point_valuations', scope: 'point-valuations:read' },
    add: async user => ({
      rewards_program_id: await insertTestRewardsProgram({ createdById: user.id }),
      value_per_point: { amount: 35_000, currency: 'usd', scale: 6 },
      note: 'cash-out value',
    }),
    update: { value_per_point: { amount: 40_000, currency: 'usd', scale: 6 }, note: 'revalued' },
  },
  {
    tool: 'manage_my_rewards_statuses',
    scopes: ['rewards-statuses:read', 'rewards-statuses:write'],
    reader: { tool: 'get_my_rewards_statuses', scope: 'rewards-statuses:read' },
    add: async user => ({
      rewards_program_status_id: await insertTestRewardsProgramStatus({ createdById: user.id }),
    }),
    update: { since: '2024-01-01', until: '2024-12-31' },
  },
  {
    tool: 'manage_my_spending',
    scopes: ['spending:read', 'spending:write'],
    reader: { tool: 'get_my_spending', scope: 'spending:read' },
    add: async user => ({
      spending_category_id: await insertTestSpendingCategory({ createdById: user.id }),
      amount: { amount: 1_000_000, currency: 'usd' },
      spending_frequency: 'monthly',
      note: 'groceries',
    }),
    update: {
      amount: { amount: 2_000_000, currency: 'usd' },
      spending_frequency: 'annually',
      note: 'travel',
    },
  },
]

// Each write returns a real stored row through the real call path, which checks it against the
// published output schema. Remove returns only the id of the row it deleted.
describe.each(cases)('MCP output schema contract for $tool — real DB', testCase => {
  let user: PrivateUser
  let caller: PrivateUser & { membership_plan: 'plus' }

  const call = (args: Record<string, unknown>) =>
    callStructuredMcpTool(caller, testCase.tool, args, testCase.scopes)
  const addRow = async () => {
    const added = await call({ action: 'add', ...(await testCase.add(user)) })
    return (added['result'] as { id: string }).id
  }

  beforeAll(async () => {
    user = await createTestUser()
    caller = { ...user, membership_plan: 'plus' }
  })

  it('adds a row', async () => {
    const added = await call({ action: 'add', ...(await testCase.add(user)) })

    expect(added).toMatchObject({ success: true, result: { id: expect.any(String) } })
  })

  it('updates a row', async () => {
    const id = await addRow()

    const updated = await call({ action: 'update', id, ...testCase.update })

    expect(updated).toMatchObject({ success: true, result: { id } })
  })

  it('removes a row and returns only its id', async () => {
    const id = await addRow()

    const removed = await call({ action: 'remove', id })

    expect(removed).toEqual({ success: true, result: { id } })
    const remaining = await callStructuredMcpTool(caller, testCase.reader.tool, {}, [
      testCase.reader.scope,
    ])
    const { results } = remaining['result'] as { results: { id: string }[] }
    expect(results.map(row => row.id)).not.toContain(id)
  })
})
