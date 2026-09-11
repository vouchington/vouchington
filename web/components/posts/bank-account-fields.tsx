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
import { BankAccountMoneyInput } from './bank-account-money-input'
import { BANK_ACCOUNT_RESULTS, BANK_ACCOUNT_TYPES } from '@ts-shared/data-points'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { CurrencyCode, Money } from '@ts-shared/money'

interface FieldsProps {
  data: Record<string, unknown>
  onUpdate: (key: string, value: unknown) => void
  disabled?: boolean
}

export function BankAccountFields({ data, onUpdate, disabled }: FieldsProps) {
  const t = useTranslations()
  const currency = (data.currency as CurrencyCode | undefined) ?? 'usd'
  return (
    <div className='space-y-4'>
      <div className='space-y-1'>
        <Label
          htmlFor='dp-ba-topic'
          data-pw='bank-account-topic-label'
        >
          {t('extracted.posts.bankAccountFields.bankAccount_d137e78c')}
        </Label>
        <TopicAutocomplete
          id='dp-ba-topic'
          topicTypes={['bank_account']}
          value={((data.topic_ids as string[]) ?? [])[0] ?? null}
          label={(data.topic_name as string) ?? ''}
          onChange={(id, name) => {
            onUpdate('topic_ids', [id])
            onUpdate('topic_name', name)
          }}
          placeholder={t('extracted.posts.bankAccountFields.searchForABankAccount_d740e1f7')}
          disabled={disabled}
        />
      </div>
      <div className='space-y-1'>
        <Label
          htmlFor='dp-ba-result'
          data-pw='bank-account-result-label'
        >
          {t('extracted.posts.bankAccountFields.result_8778e5cd')}
        </Label>
        <Select
          disabled={disabled}
          value={(data.result as string) ?? ''}
          onValueChange={v => onUpdate('result', v)}
        >
          <SelectTrigger id='dp-ba-result'>
            <SelectValue
              placeholder={t('extracted.posts.bankAccountFields.selectResult_bf0e064c')}
            />
          </SelectTrigger>
          <SelectContent>
            {BANK_ACCOUNT_RESULTS.map(r => (
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
      <div className='space-y-1'>
        <Label
          htmlFor='dp-ba-type'
          data-pw='bank-account-type-label'
        >
          {t('extracted.posts.bankAccountFields.accountTypeOptional_90245155')}
        </Label>
        <Select
          disabled={disabled}
          value={(data.account_type as string) ?? '__none__'}
          onValueChange={v => onUpdate('account_type', v === '__none__' ? null : v)}
        >
          <SelectTrigger id='dp-ba-type'>
            <SelectValue
              placeholder={t(
                'extracted.posts.bankAccountFields.selectAccountTypeOptional_bf3f4a96',
              )}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='__none__'>
              {t('extracted.posts.bankAccountFields.notSpecified_dc12bec5')}
            </SelectItem>
            {BANK_ACCOUNT_TYPES.map(t => (
              <SelectItem
                key={t.value}
                value={t.value}
              >
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className='flex items-center gap-2'>
        <Checkbox
          id='dp-ba-existing-rel'
          disabled={disabled}
          checked={(data.existing_relationship as boolean) ?? false}
          onCheckedChange={(checked: boolean | 'indeterminate') =>
            onUpdate('existing_relationship', checked === true)
          }
        />
        <Label htmlFor='dp-ba-existing-rel'>
          {t('extracted.posts.bankAccountFields.iHadAnExistingRelationshipWith_406156ec')}
        </Label>
      </div>
      <BankAccountMoneyInput
        id='dp-ba-bonus'
        label={t('extracted.posts.bankAccountFields.signUpBonusAmountOptional_947685f2')}
        disabled={disabled}
        money={data.bonus_amount as Money | null | undefined}
        currency={currency}
        onChange={v => onUpdate('bonus_amount', v)}
      />
      <div className='space-y-1'>
        <Label htmlFor='dp-ba-bonus-req'>
          {t('extracted.posts.bankAccountFields.bonusRequirementsOptional_d5f46373')}
        </Label>
        <Input
          id='dp-ba-bonus-req'
          type='text'
          disabled={disabled}
          value={(data.bonus_requirements as string) ?? ''}
          onChange={e => onUpdate('bonus_requirements', e.target.value || null)}
          placeholder={t('extracted.posts.bankAccountFields.eG500SpendIn90_90544e3b')}
          maxLength={500}
        />
      </div>
      <BankAccountMoneyInput
        id='dp-ba-min-balance'
        label={t('extracted.posts.bankAccountFields.minimumBalanceRequirementToAvoidFees_3a685883')}
        disabled={disabled}
        money={data.minimum_balance_requirement as Money | null | undefined}
        currency={currency}
        onChange={v => onUpdate('minimum_balance_requirement', v)}
      />

      <div className='flex items-center gap-2'>
        <Checkbox
          id='dp-ba-dd'
          disabled={disabled}
          checked={(data.direct_deposit_setup as boolean) ?? false}
          onCheckedChange={(checked: boolean | 'indeterminate') =>
            onUpdate('direct_deposit_setup', checked === true)
          }
        />
        <Label htmlFor='dp-ba-dd'>
          {t('extracted.posts.bankAccountFields.directDepositWasSetUp_d4a26b19')}
        </Label>
      </div>
      <div className='space-y-1'>
        <Label htmlFor='dp-ba-date'>
          {t('extracted.posts.bankAccountFields.applicationDateOptional_5ff30c57')}
        </Label>
        <Input
          id='dp-ba-date'
          type='date'
          disabled={disabled}
          value={(data.application_date as string) ?? ''}
          onChange={e => onUpdate('application_date', e.target.value || null)}
        />
      </div>
    </div>
  )
}
