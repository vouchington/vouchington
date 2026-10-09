import { createTestUser } from '@voucha/test-helpers'
import { financialMcpResultCases } from '@voucha/test-helpers/native-mcp-result-cases'
import { upsertUserFinancialProfile } from '@services/user-financial-profiles'
import { describe, expect, it } from 'vitest'
import { buildToolResult } from '../services/mcp-tools/build-tool-result.mts'
import getMyFinancialProfileTool from './get-my-financial-profile.mts'

describe('get_my_financial_profile result contract', () => {
  it.each(financialMcpResultCases)('emits the canonical MCP result fixture $id', async fixture => {
    const fixtureUser = await createTestUser()
    let ownerId: string | null = null
    if (fixture.id.endsWith('.populated')) {
      const profile = await upsertUserFinancialProfile(fixtureUser.id, {
        currency: 'usd',
        credit_score_range: '670-739',
        years_of_credit_history: 7,
        stated_income_range: {
          minimum: { amount: 7_500_000, currency: 'usd' },
          maximum: { amount: 10_000_000, currency: 'usd' },
        },
      })
      ownerId = profile.individual_id
    }
    const result = await getMyFinancialProfileTool.function(fixtureUser)({})
    const structured = buildToolResult(
      fixture.tool,
      result,
      getMyFinancialProfileTool.meta?.outputSchema,
    ).structuredContent
    const actual = structured as {
      result: { financial_profile: { individual_id: string; updated_at: string } | null }
    }
    const actualId = actual.result.financial_profile?.individual_id ?? null
    const actualUpdatedAt = actual.result.financial_profile?.updated_at ?? null
    expect(actualId).toBe(ownerId)
    expect(actualUpdatedAt === null).toBe(ownerId === null)
    expect(actualUpdatedAt === null || !Number.isNaN(Date.parse(actualUpdatedAt))).toBe(true)
    if (actual.result.financial_profile !== null) {
      actual.result.financial_profile.individual_id = '0198ffff-0000-7000-8000-000000000019'
      actual.result.financial_profile.updated_at = '2026-10-09T00:00:00.000Z'
    }
    expect(structured).toEqual(fixture.structuredContent)
  })
})
