'use client'

import type {
  CreditCardDataPoint,
  BankAccountDataPoint,
  DataPointVertical,
} from '@voucha/types/entities/data-point'
import {
  APPLICATION_METHOD_LABELS,
  BANK_ACCOUNT_RESULT_LABELS,
  BANK_ACCOUNT_TYPE_LABELS,
  CREDIT_CARD_RESULT_LABELS,
  formatMoneyRange,
} from './data-point-detail-format'
import { DataPointResultBadge, DataPointRow } from './data-point-detail-fields'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { formatMoney } from '@/lib/money'

interface Props {
  vertical: DataPointVertical
  structuredData: unknown
  labels: { creditCard: string; bankAccount: string }
}

export function DataPointDetail({ vertical, structuredData, labels }: Props) {
  const uiLocale = useUiLocale()
  if (!structuredData || typeof structuredData !== 'object' || Array.isArray(structuredData))
    return null

  if (vertical === 'credit_card') {
    const data = structuredData as CreditCardDataPoint
    const resultLabel = CREDIT_CARD_RESULT_LABELS[data.result] ?? data.result
    return (
      <div className='rounded-md border bg-muted/30 p-4 sm:p-6 md:p-8 space-y-0.5'>
        <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2'>
          {labels.creditCard}
        </p>
        <DataPointRow label='Result'>
          <DataPointResultBadge
            result={data.result}
            label={resultLabel}
          />
        </DataPointRow>
        {data.credit_score_range && (
          <DataPointRow
            label='Credit Score'
            value={data.credit_score_range}
          />
        )}
        {data.stated_income_range && (
          <DataPointRow
            label='Stated Income'
            value={formatMoneyRange(data.stated_income_range, uiLocale)}
          />
        )}
        {data.credit_limit != null && (
          <DataPointRow
            label='Credit Limit'
            value={formatMoney(data.credit_limit, uiLocale)}
          />
        )}
        {data.total_credit_limit_all_cards != null && (
          <DataPointRow
            label='Total Credit Limit (all cards)'
            value={formatMoney(data.total_credit_limit_all_cards, uiLocale)}
          />
        )}
        {data.years_of_credit_history != null && (
          <DataPointRow
            label='Credit History'
            value={`${data.years_of_credit_history} years`}
          />
        )}
        {data.hard_inquiries_12m != null && (
          <DataPointRow
            label='Hard Inquiries (12m)'
            value={data.hard_inquiries_12m}
          />
        )}
        {data.cards_opened_24m != null && (
          <DataPointRow
            label='Cards Opened (24m)'
            value={data.cards_opened_24m}
          />
        )}
        {data.existing_relationship != null && (
          <DataPointRow
            label='Existing Relationship'
            value={data.existing_relationship ? 'Yes' : 'No'}
          />
        )}
        {data.is_business_application != null && (
          <DataPointRow
            label='Application Type'
            value={data.is_business_application ? 'Business' : 'Personal'}
          />
        )}
        {data.application_method && (
          <DataPointRow
            label='Application Method'
            value={APPLICATION_METHOD_LABELS[data.application_method] ?? data.application_method}
          />
        )}
        {data.application_date && (
          <DataPointRow
            label='Application Date'
            value={data.application_date}
          />
        )}
      </div>
    )
  }

  if (vertical === 'bank_account') {
    const data = structuredData as BankAccountDataPoint
    const resultLabel = BANK_ACCOUNT_RESULT_LABELS[data.result] ?? data.result
    return (
      <div className='rounded-md border bg-muted/30 p-4 sm:p-6 md:p-8 space-y-0.5'>
        <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2'>
          {labels.bankAccount}
        </p>
        <DataPointRow label='Result'>
          <DataPointResultBadge
            result={data.result}
            label={resultLabel}
          />
        </DataPointRow>
        {data.account_type && (
          <DataPointRow
            label='Account Type'
            value={BANK_ACCOUNT_TYPE_LABELS[data.account_type] ?? data.account_type}
          />
        )}
        {data.credit_score_range && (
          <DataPointRow
            label='Credit Score'
            value={data.credit_score_range}
          />
        )}
        {data.stated_income_range && (
          <DataPointRow
            label='Stated Income'
            value={formatMoneyRange(data.stated_income_range, uiLocale)}
          />
        )}
        {data.bonus_amount != null && (
          <DataPointRow
            label='Sign-Up Bonus'
            value={formatMoney(data.bonus_amount, uiLocale)}
          />
        )}
        {data.bonus_requirements && (
          <DataPointRow
            label='Bonus Requirements'
            value={data.bonus_requirements}
          />
        )}
        {data.minimum_balance_requirement != null && (
          <DataPointRow
            label='Min. Balance Requirement'
            value={formatMoney(data.minimum_balance_requirement, uiLocale)}
          />
        )}
        {data.existing_relationship != null && (
          <DataPointRow
            label='Existing Relationship'
            value={data.existing_relationship ? 'Yes' : 'No'}
          />
        )}
        {data.direct_deposit_setup != null && (
          <DataPointRow
            label='Direct Deposit Setup'
            value={data.direct_deposit_setup ? 'Yes' : 'No'}
          />
        )}
        {data.application_date && (
          <DataPointRow
            label='Application Date'
            value={data.application_date}
          />
        )}
      </div>
    )
  }

  return null
}
