'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { FinancialProfile } from '@/types/my'
import { useTranslations } from '@/lib/i18n/use-translations'
import { BankAccountMoneyInput } from './bank-account-money-input'
import type { CurrencyCode, Money } from '@ts-shared/money'

interface DataPointCreditCardProfileFieldsProps {
  data: Record<string, unknown>
  disabled?: boolean
  onUpdate: (key: string, value: unknown) => void
  userFinancialProfile?: FinancialProfile | null
}

export function DataPointCreditCardProfileFields({
  data,
  disabled,
  onUpdate,
  userFinancialProfile,
}: DataPointCreditCardProfileFieldsProps) {
  const t = useTranslations()
  const currency =
    (data.currency as CurrencyCode | undefined) ?? userFinancialProfile?.currency ?? 'usd'
  const profileTotalCreditLimit =
    userFinancialProfile?.currency === currency
      ? userFinancialProfile.total_credit_limit
      : undefined
  return (
    <>
      <div className='space-y-1'>
        <Label
          htmlFor='dp-profile-inquiries'
          data-pw='credit-card-profile-inquiries-label'
        >
          {t(
            'extracted.posts.dataPointCreditCardProfileFields.hardInquiriesLast12MonthsOptional_9bb273f9',
          )}
        </Label>
        <Input
          id='dp-profile-inquiries'
          type='number'
          min={0}
          disabled={disabled}
          value={
            data.hard_inquiries_12m !== undefined
              ? ((data.hard_inquiries_12m as number | null) ?? '')
              : (userFinancialProfile?.hard_inquiries_12m ?? '')
          }
          onChange={e =>
            onUpdate('hard_inquiries_12m', e.target.value ? parseInt(e.target.value, 10) : null)
          }
          placeholder={t('extracted.posts.dataPointCreditCardProfileFields.0_5feceb66')}
        />
      </div>

      <div className='space-y-1'>
        <Label
          htmlFor='dp-profile-cards-24m'
          data-pw='credit-card-profile-cards-24m-label'
        >
          {t(
            'extracted.posts.dataPointCreditCardProfileFields.cardsOpenedLast24MonthsOptional_fa76b337',
          )}
        </Label>
        <Input
          id='dp-profile-cards-24m'
          type='number'
          min={0}
          disabled={disabled}
          value={
            data.cards_opened_24m !== undefined
              ? ((data.cards_opened_24m as number | null) ?? '')
              : (userFinancialProfile?.cards_opened_24m ?? '')
          }
          onChange={e =>
            onUpdate('cards_opened_24m', e.target.value ? parseInt(e.target.value, 10) : null)
          }
          placeholder={t('extracted.posts.dataPointCreditCardProfileFields.0_5feceb66')}
        />
      </div>

      <div data-pw='credit-card-profile-total-limit-field'>
        <BankAccountMoneyInput
          id='dp-profile-total-limit'
          label={t(
            'extracted.posts.dataPointCreditCardProfileFields.totalCreditLimitAllCardsOptional_51fab3b9',
          )}
          disabled={disabled}
          money={
            data.total_credit_limit_all_cards !== undefined
              ? (data.total_credit_limit_all_cards as Money | null)
              : profileTotalCreditLimit
          }
          currency={currency}
          onChange={value => onUpdate('total_credit_limit_all_cards', value)}
        />
      </div>

      <div className='space-y-1'>
        <Label
          htmlFor='dp-profile-years'
          data-pw='credit-card-profile-years-label'
        >
          {t(
            'extracted.posts.dataPointCreditCardProfileFields.yearsOfCreditHistoryOptional_95e9ef36',
          )}
        </Label>
        <Input
          id='dp-profile-years'
          type='number'
          min={0}
          max={100}
          disabled={disabled}
          value={
            data.years_of_credit_history !== undefined
              ? ((data.years_of_credit_history as number | null) ?? '')
              : (userFinancialProfile?.years_of_credit_history ?? '')
          }
          onChange={e =>
            onUpdate(
              'years_of_credit_history',
              e.target.value ? parseInt(e.target.value, 10) : null,
            )
          }
          placeholder={t('extracted.posts.dataPointCreditCardProfileFields.0_5feceb66')}
        />
      </div>
    </>
  )
}
