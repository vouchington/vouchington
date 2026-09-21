import type { BasicUser } from '@services/users/types'
import type { Tool } from './types.mts'
import {
  assertValidFinancialProfile,
  upsertUserFinancialProfile,
} from '@services/user-financial-profiles'
import { CREDIT_SCORE_RANGES } from '@ts-shared/data-points'
import {
  currencyCodeSchema,
  moneyRangeSchema,
  moneySchema,
} from '@ts-shared/data-points/json-schemas'
import type { CurrencyCode, Money, MoneyRange } from '@ts-shared/money'

const VALID_CREDIT_SCORE_RANGES = CREDIT_SCORE_RANGES.map(o => o.value)

type ToolArgs = {
  currency?: CurrencyCode
  credit_score_range?: string | null
  stated_income_range?: MoneyRange | null
  total_credit_limit?: Money | null
  years_of_credit_history?: number | null
}

type ToolResult = {
  success: true
  profile: {
    credit_score_range: string | null
    stated_income_range: MoneyRange | null
    total_credit_limit: Money | null
    currency: CurrencyCode
    years_of_credit_history: number | null
  }
}

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'update_my_financial_profile',
    type: 'function',
    description:
      "Update the current user's financial profile used for personalized data point comparisons. Only provide fields you want to update — omitted fields are unchanged.",
    parameters: {
      type: 'object',
      properties: {
        currency: {
          ...currencyCodeSchema,
          description: "Currency shared by all of the user's monetary profile values",
        },
        credit_score_range: {
          anyOf: [{ type: 'null' }, { type: 'string', enum: VALID_CREDIT_SCORE_RANGES }],
          description: "User's credit score range",
        },
        stated_income_range: {
          anyOf: [{ type: 'null' }, moneyRangeSchema],
          description:
            'Annual income range in integer minor units paired with its currency; for example, USD 75,000 to USD 100,000 is {"minimum":{"amount":7500000,"currency":"usd"},"maximum":{"amount":10000000,"currency":"usd"}}',
        },
        total_credit_limit: {
          anyOf: [{ type: 'null' }, moneySchema],
          description:
            'Total credit limit across all cards in integer minor units paired with its currency; for example, USD 25,000 is {"amount":2500000,"currency":"usd"}',
        },
        years_of_credit_history: {
          anyOf: [{ type: 'null' }, { type: 'integer', minimum: 0, maximum: 100 }],
          description: 'Years of credit history (0–100)',
        },
      },
      required: [],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    plan: 'plus',
    requiredScopes: { mcp: ['financial-profile:read', 'financial-profile:write'] },
    annotations: { destructiveHint: true },
    api: [
      { method: 'GET', path: '/api/v1/my/financial-profile' },
      { method: 'PUT', path: '/api/v1/my/financial-profile' },
    ],
  },
  function:
    (currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      assertValidFinancialProfile(args as Record<string, unknown>)

      const profile = await upsertUserFinancialProfile(currentUser.id, {
        currency: args.currency,
        credit_score_range: args.credit_score_range,
        stated_income_range: args.stated_income_range,
        total_credit_limit: args.total_credit_limit,
        years_of_credit_history: args.years_of_credit_history,
      })

      return {
        success: true,
        profile: {
          credit_score_range: profile.credit_score_range ?? null,
          stated_income_range: profile.stated_income_range ?? null,
          total_credit_limit: profile.total_credit_limit ?? null,
          currency: profile.currency,
          years_of_credit_history: profile.years_of_credit_history ?? null,
        },
      }
    },
}

export default tool
