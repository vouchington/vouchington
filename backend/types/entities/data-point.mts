import type { CurrencyCode, Money, MoneyRange } from '@ts-shared/money'

export type DataPointVertical = 'credit_card' | 'bank_account'

// Credit score brackets
export type CreditScoreRange = '300-579' | '580-669' | '670-739' | '740-799' | '800-850'

export type ApplicationMethod = 'online' | 'in_branch' | 'phone' | 'pre_approved'

export type BankAccountType = 'checking' | 'savings' | 'cd' | 'money_market'

export type CreditCardResult =
  | 'approved'
  | 'denied'
  | 'pending'
  | 'counter_offer'
  | 'retention_offer'
  | 'sign_up_bonus'
  | 'offer'

export type BankAccountResult = 'approved' | 'denied' | 'sign_up_bonus' | 'offer'

export type CreditCardDataPoint = {
  vertical: 'credit_card'
  schema_version: 1
  // Card topic IDs (FK to topics where topic_type='card'), synced to post_data_point_topics
  topic_ids: string[]
  // Application or action result
  result: CreditCardResult
  currency: CurrencyCode
  // Self-reported credit score bracket at time of application (required)
  credit_score_range: CreditScoreRange
  // Annual income reported on the application
  stated_income_range?: MoneyRange | null
  // Whether the applicant had an existing account with the issuer
  existing_relationship?: boolean
  // Hard inquiries in the last 12 months
  hard_inquiries_12m?: number | null
  // New cards opened in the prior 24 months (relevant for 5/24-style rules)
  cards_opened_24m?: number | null
  // Approved credit limit, paired with its currency (if approved)
  credit_limit?: Money | null
  // Total revolving credit limit across all open cards at time of application
  total_credit_limit_all_cards?: Money | null
  // Estimated years of credit history at time of application
  years_of_credit_history?: number | null
  // Whether this was a business card application
  is_business_application?: boolean
  // How the application was submitted
  application_method?: ApplicationMethod | null
  // ISO date of application (YYYY-MM-DD)
  application_date?: string | null
}

export type BankAccountDataPoint = {
  vertical: 'bank_account'
  schema_version: 1
  // Bank account topic IDs (FK to topics where topic_type='bank_account'), synced to post_data_point_topics
  topic_ids: string[]
  // Application or action result
  result: BankAccountResult
  currency: CurrencyCode
  // Type of bank account
  account_type?: BankAccountType | null
  // Self-reported credit score at time of application
  credit_score_range?: CreditScoreRange | null
  // Annual income reported on the application
  stated_income_range?: MoneyRange | null
  // Whether the applicant had an existing relationship with the bank
  existing_relationship?: boolean
  // Sign-up bonus amount
  bonus_amount?: Money | null
  // Description of bonus requirements (e.g. "$500 spend in 90 days")
  bonus_requirements?: string | null
  // Minimum balance requirement to avoid fees
  minimum_balance_requirement?: Money | null
  // Whether direct deposit was set up (often required for bonuses)
  direct_deposit_setup?: boolean
  // ISO date of application (YYYY-MM-DD)
  application_date?: string | null
}

export type StructuredDataPoint = CreditCardDataPoint | BankAccountDataPoint

export type UserFinancialProfile = {
  individual_id: string
  credit_score_range: CreditScoreRange | null
  stated_income_range: MoneyRange | null
  // Total credit limit across all open cards
  total_credit_limit: Money | null
  currency: CurrencyCode
  years_of_credit_history: number | null
  // Hard credit inquiries in the last 12 months
  hard_inquiries_12m: number | null
  // New credit cards opened in the last 24 months
  cards_opened_24m: number | null
  updated_at: Date
}
