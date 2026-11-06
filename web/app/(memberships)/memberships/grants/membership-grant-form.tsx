'use client'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { UserAutocomplete } from '@/components/users/user-autocomplete'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { useTranslations } from '@/lib/i18n/use-translations'
import { formatMoney } from '@/lib/money'

import type { Dispatch } from 'react'
import {
  isValidDurationDays,
  type MembershipGrantAction,
  type MembershipGrantState,
} from './membership-grant-state'

export function MembershipGrantForm({
  state,
  dispatch,
  handlePlanChange,
  handleGrant,
}: {
  state: MembershipGrantState
  dispatch: Dispatch<MembershipGrantAction>
  handlePlanChange: (plan: string) => Promise<void>
  handleGrant: () => Promise<void>
}) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  return (
    <div className='space-y-4'>
      <div className='space-y-2'>
        <Label htmlFor='userId'>{t('extracted.grants.membershipsAdminClient.user_b512d97e')}</Label>
        <UserAutocomplete
          key={state.userKey}
          id='userId'
          label=''
          value={state.userId}
          onChange={id => dispatch({ userId: id })}
          placeholder={t('extracted.grants.membershipsAdminClient.searchUsers_beb0e209')}
          clearOnTextEdit
          dataPw={{
            input: 'memberships-grant-user-input',
            item: 'memberships-grant-user-item',
          }}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='plan'>{t('extracted.grants.membershipsAdminClient.plan_fa8ed0bd')}</Label>
        <Select
          value={state.plan}
          onValueChange={handlePlanChange}
        >
          <SelectTrigger
            id='plan'
            data-pw='memberships-grant-plan-trigger'
          >
            <SelectValue
              placeholder={t('extracted.grants.membershipsAdminClient.selectPlan_a982ee90')}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              value='plus'
              data-pw='memberships-grant-plan-option-plus'
            >
              {t('extracted.grants.membershipsAdminClient.plus_8a784378')}
            </SelectItem>
            <SelectItem
              value='pro'
              data-pw='memberships-grant-plan-option-pro'
            >
              {t('extracted.grants.membershipsAdminClient.pro_957b0b87')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className='space-y-2'>
        <Label htmlFor='durationDays'>
          {t('extracted.grants.membershipsAdminClient.durationDays_b670ab3c')}
        </Label>
        <Input
          id='durationDays'
          data-pw='memberships-grant-duration-days'
          type='number'
          min={1}
          max={3660}
          step={1}
          value={state.durationDays}
          onChange={event => dispatch({ durationDays: event.target.value })}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='skuId'>{t('extracted.grants.membershipsAdminClient.sku_f88ba99c')}</Label>
        <Select
          value={state.skuId}
          onValueChange={v => dispatch({ skuId: v })}
          disabled={!state.plan || state.skuOptions.length === 0}
        >
          <SelectTrigger
            id='skuId'
            data-pw='memberships-grant-sku-trigger'
          >
            <SelectValue
              placeholder={t('extracted.grants.membershipsAdminClient.selectSku_a2d493f4')}
            />
          </SelectTrigger>
          <SelectContent>
            {state.skuOptions.map(s => (
              <SelectItem
                key={s.id}
                value={s.id}
                // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from SKU row data
                data-pw={`memberships-grant-sku-option-${s.id}`}
              >
                {t('extracted.grants.membershipsAdminClient.skuidIntervalPriceCurrency_cc8fbf2b', {
                  skuId: s.id,
                  interval: s.interval,
                  price: formatMoney(s.price, uiLocale),
                  currency: s.price.currency.toUpperCase(),
                })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {state.successMessage && (
        <p
          data-pw='memberships-grant-success'
          className='text-sm text-green-600'
        >
          {state.successMessage}
        </p>
      )}
      {state.errorMessage && (
        <p
          data-pw='memberships-grant-error'
          className='text-sm text-destructive'
        >
          {state.errorMessage}
        </p>
      )}
      <Button
        data-pw='memberships-grant-submit'
        loading={state.loading}
        disabled={
          state.loading ||
          !state.userId ||
          !state.plan ||
          !state.skuId ||
          !isValidDurationDays(state.durationDays)
        }
        onClick={handleGrant}
      >
        {state.loading
          ? t('extracted.grants.membershipsAdminClient.granting_3e4f5a6b')
          : t('extracted.grants.membershipsAdminClient.grantMembership_7c8d9e0f')}
      </Button>
    </div>
  )
}
