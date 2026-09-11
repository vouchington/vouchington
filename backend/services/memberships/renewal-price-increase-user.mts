import { parsePostgresMoneyAmount, type Money } from '@ts-shared/money'

export type RenewalPriceIncreaseUser = {
  user_id: string
  membership_id: string
  membership_provider_observation_id: string
  current_price: Money
  new_price: Money
  plan: string
  interval: string
  expires_at: Date
}

export function renewalPriceIncreaseUser(row: unknown): RenewalPriceIncreaseUser {
  const value = row as Omit<RenewalPriceIncreaseUser, 'current_price' | 'new_price'> & {
    current_price_minor_units: string
    new_price_minor_units: string
    currency_code: Money['currency']
  }
  return {
    user_id: value.user_id,
    membership_id: value.membership_id,
    membership_provider_observation_id: value.membership_provider_observation_id,
    current_price: {
      amount: parsePostgresMoneyAmount(value.current_price_minor_units),
      currency: value.currency_code,
    },
    new_price: {
      amount: parsePostgresMoneyAmount(value.new_price_minor_units),
      currency: value.currency_code,
    },
    plan: value.plan,
    interval: value.interval,
    expires_at: value.expires_at,
  }
}
