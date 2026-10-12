/** Structured MCP results consumed by native clients. The catalog validates each case. */
export type McpResultFixtureCase = {
  id: string
  tool: string
  arguments: Record<string, unknown>
  structuredContent: Record<string, unknown>
}

export const financialMcpResultCases: readonly McpResultFixtureCase[] = [
  {
    id: 'native.mcp.get-my-financial-profile.null',
    tool: 'get_my_financial_profile',
    arguments: {},
    structuredContent: { success: true, result: { financial_profile: null } },
  },
  {
    id: 'native.mcp.get-my-financial-profile.populated',
    tool: 'get_my_financial_profile',
    arguments: {},
    structuredContent: {
      success: true,
      result: {
        financial_profile: {
          individual_id: '0198ffff-0000-7000-8000-000000000019',
          credit_score_range: '670-739',
          stated_income_range: {
            minimum: { amount: 7_500_000, currency: 'usd' },
            maximum: { amount: 10_000_000, currency: 'usd' },
          },
          total_credit_limit: null,
          currency: 'usd',
          years_of_credit_history: 7,
          hard_inquiries_12m: null,
          cards_opened_24m: null,
          updated_at: '2026-10-09T00:00:00.000Z',
        },
      },
    },
  },
]
