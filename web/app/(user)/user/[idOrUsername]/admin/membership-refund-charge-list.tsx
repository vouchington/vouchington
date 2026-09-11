'use client'

import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import type { RefundableCharge } from '@/types/api-responses'
import { chargeKey } from './membership-refund-charge-key.ts'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { useTranslations } from '@/lib/i18n/use-translations'
import { formatMoney } from '@/lib/money'

interface MembershipRefundChargeListProps {
  charges: RefundableCharge[]
  selectedCharge: RefundableCharge
  onSelect: (charge: RefundableCharge) => void
  disabled: boolean
}

export function MembershipRefundChargeList({
  charges,
  selectedCharge,
  onSelect,
  disabled,
}: MembershipRefundChargeListProps) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  return (
    <RadioGroup
      value={chargeKey(selectedCharge)}
      onValueChange={(value: string) => {
        const next = charges.find(charge => chargeKey(charge) === value)
        if (next) onSelect(next)
      }}
      className='gap-2'
      data-pw='membership-refund-charge-list'
    >
      {charges.map(charge => {
        const refundable = charge.amount.amount - charge.amount_refunded.amount
        const amountDisplay = formatMoney(charge.amount, uiLocale)
        const refundedDisplay =
          charge.amount_refunded.amount > 0
            ? ` ${t(
                'extracted.admin.membershipRefundChargeList.parenAmountAlreadyRefundedParen_5c9a1e2b',
                {
                  amount: formatMoney(charge.amount_refunded, uiLocale),
                },
              )}`
            : ''
        const dateDisplay = new Date(charge.created_at).toLocaleDateString(uiLocale)
        const id = chargeKey(charge)
        return (
          <Label
            key={id}
            htmlFor={`refund-charge-${id}`}
            className={cn(
              'flex items-start gap-2 font-normal',
              !(disabled || refundable <= 0) && 'cursor-pointer',
            )}
            data-pw='membership-refund-charge-option'
          >
            <RadioGroupItem
              id={`refund-charge-${id}`}
              value={id}
              disabled={disabled || refundable <= 0}
              className='mt-0.5'
              aria-label={t(
                'extracted.admin.membershipRefundChargeList.selectChargeFromDatedisplayForAmountdisplay_d11a7bf5',
                { dateDisplay, amountDisplay },
              )}
            />
            <span>
              {t('extracted.admin.membershipRefundChargeList.datedisplayAmountdisplay_60744cf0', {
                dateDisplay,
                amountDisplay,
              })}
              {refundedDisplay}
              {charge.description ? ` (${charge.description})` : ''}
              {refundable <= 0
                ? ` ${t('extracted.admin.membershipRefundChargeList.bracketFullyRefundedBracket_1a7f4c88')}`
                : ''}
            </span>
          </Label>
        )
      })}
    </RadioGroup>
  )
}
