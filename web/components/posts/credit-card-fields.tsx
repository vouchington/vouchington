'use client'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TopicAutocomplete } from './topic-autocomplete'
import { CREDIT_CARD_RESULTS, APPLICATION_METHODS } from '@ts-shared/data-points'
import { useTranslations } from '@/lib/i18n/use-translations'
import { BankAccountMoneyInput } from './bank-account-money-input'
import type { CurrencyCode, Money } from '@ts-shared/money'

interface FieldsProps {
  data: Record<string, unknown>
  onUpdate: (key: string, value: unknown) => void
  disabled?: boolean
}

export function CreditCardFields({ data, onUpdate, disabled }: FieldsProps) {
  const t = useTranslations()
  const currency = (data.currency as CurrencyCode | undefined) ?? 'usd'
  return (
    <div className='space-y-4'>
      {/* Card topic autocomplete */}
      <div className='space-y-1'>
        <Label
          htmlFor='dp-cc-topic'
          data-pw='credit-card-topic-label'
        >
          {t('extracted.posts.creditCardFields.card_cc9cac77')}
        </Label>
        <TopicAutocomplete
          id='dp-cc-topic'
          topicTypes={['card']}
          value={((data.topic_ids as string[]) ?? [])[0] ?? null}
          label={(data.topic_name as string) ?? ''}
          onChange={(id, name) => {
            onUpdate('topic_ids', [id])
            onUpdate('topic_name', name)
          }}
          placeholder={t('extracted.posts.creditCardFields.searchForACreditCard_8e903841')}
          disabled={disabled}
        />
      </div>

      {/* Result */}
      <div className='space-y-1'>
        <Label
          htmlFor='dp-cc-result'
          data-pw='credit-card-result-label'
        >
          {t('extracted.posts.creditCardFields.result_8778e5cd')}
        </Label>
        <Select
          disabled={disabled}
          value={(data.result as string) ?? ''}
          onValueChange={v => onUpdate('result', v)}
        >
          <SelectTrigger
            id='dp-cc-result'
            data-pw='credit-card-result-trigger'
          >
            <SelectValue
              placeholder={t('extracted.posts.creditCardFields.selectResult_bf0e064c')}
            />
          </SelectTrigger>
          <SelectContent>
            {CREDIT_CARD_RESULTS.map(r => (
              <SelectItem
                key={r.value}
                value={r.value}
              >
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Existing relationship */}
      <div className='flex items-center gap-2'>
        <Checkbox
          id='dp-cc-existing-rel'
          disabled={disabled}
          checked={(data.existing_relationship as boolean) ?? false}
          onCheckedChange={(checked: boolean | 'indeterminate') =>
            onUpdate('existing_relationship', checked === true)
          }
        />
        <Label htmlFor='dp-cc-existing-rel'>
          {t('extracted.posts.creditCardFields.iHadAnExistingRelationshipWith_fadac80c')}
        </Label>
      </div>

      {/* Credit limit (if approved) */}
      <BankAccountMoneyInput
        id='dp-cc-limit'
        label={t('extracted.posts.creditCardFields.approvedCreditLimitOptional_4d85ddcf')}
        disabled={disabled}
        money={data.credit_limit as Money | null | undefined}
        currency={currency}
        onChange={value => onUpdate('credit_limit', value)}
      />

      {/* Business application */}
      <div className='flex items-center gap-2'>
        <Checkbox
          id='dp-cc-business'
          disabled={disabled}
          checked={(data.is_business_application as boolean) ?? false}
          onCheckedChange={(checked: boolean | 'indeterminate') =>
            onUpdate('is_business_application', checked === true)
          }
        />
        <Label htmlFor='dp-cc-business'>
          {t('extracted.posts.creditCardFields.thisWasABusinessCardApplication_0fa95782')}
        </Label>
      </div>

      {/* Application method */}
      <div className='space-y-1'>
        <Label htmlFor='dp-cc-method'>
          {t('extracted.posts.creditCardFields.applicationMethodOptional_e84b0663')}
        </Label>
        <Select
          disabled={disabled}
          value={(data.application_method as string) ?? '__none__'}
          onValueChange={v => onUpdate('application_method', v === '__none__' ? null : v)}
        >
          <SelectTrigger id='dp-cc-method'>
            <SelectValue
              placeholder={t('extracted.posts.creditCardFields.selectMethodOptional_e53a2242')}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='__none__'>
              {t('extracted.posts.creditCardFields.notSpecified_dc12bec5')}
            </SelectItem>
            {APPLICATION_METHODS.map(m => (
              <SelectItem
                key={m.value}
                value={m.value}
              >
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Application date */}
      <div className='space-y-1'>
        <Label htmlFor='dp-cc-date'>
          {t('extracted.posts.creditCardFields.applicationDateOptional_5ff30c57')}
        </Label>
        <Input
          id='dp-cc-date'
          type='date'
          disabled={disabled}
          value={(data.application_date as string) ?? ''}
          onChange={e => onUpdate('application_date', e.target.value || null)}
        />
      </div>
    </div>
  )
}
