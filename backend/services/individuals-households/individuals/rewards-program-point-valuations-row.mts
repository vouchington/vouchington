import type { IndividualRewardsProgramPointValuation } from './rewards-program-point-valuations-types.mts'
import { MONEY_SCALE, parsePostgresMoneyAmount, type CurrencyCode } from '@ts-shared/money'

export type PointValuationRow = Omit<
  IndividualRewardsProgramPointValuation,
  'rewards_program' | 'value_per_point'
> & {
  value_microunits_per_point: string
  currency_code: CurrencyCode
  rewards_program_name: string
  rewards_program_slug: string
}

export function toPointValuation(row: PointValuationRow): IndividualRewardsProgramPointValuation {
  return {
    id: row.id,
    rewards_program_id: row.rewards_program_id,
    value_per_point: {
      amount: parsePostgresMoneyAmount(row.value_microunits_per_point),
      currency: row.currency_code,
      scale: MONEY_SCALE,
    },
    note: row.note,
    rewards_program: {
      id: row.rewards_program_id,
      name: row.rewards_program_name,
      slug: row.rewards_program_slug,
    },
  }
}
