'use client'

import { useId, useRef, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import * as refundAttemptStorage from './membership-refund-attempt.ts'
import { chargeKey } from './membership-refund-charge-key.ts'
import { MembershipRefundChargeList } from './membership-refund-charge-list.tsx'
import { MembershipRefundSubmitButton } from './membership-refund-submit-button.tsx'
import { useMembershipRefundSubmission } from './use-membership-refund-submission.ts'
import type {
  MembershipRefundFormProps,
  MembershipRefundFormState,
} from './membership-refund-form.types.ts'
import { useTranslations } from '@/lib/i18n/use-translations'
import { getCurrency } from '@ts-shared/money'

export function MembershipRefundForm({
  actorUserId,
  userId,
  charges,
  onReload,
}: MembershipRefundFormProps) {
  const restored = refundAttemptStorage.useMembershipRefundAttempt(
    { actorUserId, targetUserId: userId },
    charges,
  )
  return (
    <MembershipRefundFormStateful
      key={`${actorUserId}:${userId}:${restored?.attempt.requestFingerprint ?? 'new'}:${restored?.reconciliationRetryAt ?? 'ready'}`}
      actorUserId={actorUserId}
      userId={userId}
      charges={charges}
      onReload={onReload}
      restored={restored}
    />
  )
}

function MembershipRefundFormStateful({
  actorUserId,
  userId,
  charges,
  onReload,
  restored,
}: MembershipRefundFormProps & {
  restored: ReturnType<typeof refundAttemptStorage.useMembershipRefundAttempt>
}) {
  const t = useTranslations()
  const reasonId = useId()
  const noteId = useId()
  const amountId = useId()
  const revokeId = useId()
  const refundAttemptRef = useRef(restored?.attempt ?? null)
  const [selectedChargeKey, setSelectedChargeKey] = useState(restored?.selectedChargeKey ?? null)
  const [reconciliationRetryAt, setReconciliationRetryAt] = useState(
    restored?.reconciliationRetryAt ?? null,
  )
  const [formState, setFormState] = useState<MembershipRefundFormState>(
    restored?.formState ?? { reason: 'goodwill', cancel: false, amountStr: '', note: '' },
  )
  const selectedCharge =
    charges.find(charge => chargeKey(charge) === selectedChargeKey) ?? charges[0]!
  const updateForm = (patch: Partial<MembershipRefundFormState>) =>
    setFormState(state => ({ ...state, ...patch }))
  const { handleSubmit, isBusy } = useMembershipRefundSubmission({
    actorUserId,
    userId,
    selectedCharge,
    formState,
    reconciliationRetryAt,
    attemptRef: refundAttemptRef,
    setReconciliationRetryAt,
    resetForm: () => {
      setSelectedChargeKey(null)
      setFormState({ reason: 'goodwill', cancel: false, amountStr: '', note: '' })
    },
    onReload,
  })
  const intentLocked = isBusy || reconciliationRetryAt !== null
  return (
    <form
      className='flex max-w-2xl flex-col gap-4'
      onSubmit={handleSubmit}
      data-pw='membership-refund-form'
    >
      <div className='flex flex-col gap-2'>
        <Label>{t('extracted.admin.membershipRefundForm.chargeToRefund_00c4f85b')}</Label>
        <MembershipRefundChargeList
          charges={charges}
          selectedCharge={selectedCharge}
          onSelect={charge => {
            const nextChargeKey = chargeKey(charge)
            if (nextChargeKey === chargeKey(selectedCharge)) return
            setSelectedChargeKey(nextChargeKey)
            updateForm({ amountStr: '' })
          }}
          disabled={intentLocked}
        />
      </div>
      <div className='flex flex-col gap-2'>
        <Label htmlFor={reasonId}>
          {t('extracted.admin.membershipRefundForm.reason_f81ab834')}
        </Label>
        <Select
          value={formState.reason}
          onValueChange={value => updateForm({ reason: value })}
          disabled={intentLocked}
        >
          <SelectTrigger
            id={reasonId}
            data-pw='membership-refund-reason-select'
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='goodwill'>
              {t('extracted.admin.membershipRefundForm.goodwill_1202ac7e')}
            </SelectItem>
            <SelectItem value='requested'>
              {t('extracted.admin.membershipRefundForm.requestedByCustomer_50db9996')}
            </SelectItem>
            <SelectItem value='dispute'>
              {t('extracted.admin.membershipRefundForm.dispute_3a8931a9')}
            </SelectItem>
            <SelectItem value='other'>
              {t('extracted.admin.membershipRefundForm.other_f97e9da0')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className='flex flex-col gap-2'>
        <Label htmlFor={amountId}>
          {t('extracted.admin.membershipRefundForm.amountCentsLeaveBlankForFull_209317b3')}
        </Label>
        <Input
          id={amountId}
          type='text'
          inputMode='decimal'
          value={formState.amountStr}
          onChange={e => updateForm({ amountStr: e.target.value })}
          disabled={intentLocked}
          data-pw='membership-refund-amount-input'
          placeholder={t('extracted.admin.membershipRefundForm.forExampleAmount_0286fc9b', {
            amount:
              selectedCharge &&
              getCurrency(selectedCharge.amount.currency).minor_unit_exponent === 0
                ? '500'
                : '5.00',
          })}
        />
      </div>
      <div className='flex items-center gap-2 text-sm'>
        <Checkbox
          id={revokeId}
          checked={formState.cancel}
          onCheckedChange={checked => updateForm({ cancel: checked === true })}
          disabled={intentLocked}
          data-pw='membership-refund-revoke-checkbox'
        />
        <Label htmlFor={revokeId}>
          {t(
            'extracted.admin.membershipRefundForm.alsoCancelSubscriptionRevokeAccessImmediately_dc843975',
          )}
        </Label>
      </div>
      <div className='flex flex-col gap-2'>
        <Label htmlFor={noteId}>
          {t('extracted.admin.membershipRefundForm.noteOptional_f9b73e1a')}
        </Label>
        <Textarea
          id={noteId}
          value={formState.note}
          onChange={e => updateForm({ note: e.target.value })}
          disabled={intentLocked}
          placeholder={t('extracted.admin.membershipRefundForm.internalNoteForAuditLog_8c1a7068')}
          data-pw='membership-refund-note-textarea'
        />
      </div>
      <MembershipRefundSubmitButton
        cancel={formState.cancel}
        reconciliationPending={reconciliationRetryAt !== null}
        disabled={intentLocked || !selectedCharge}
      />
    </form>
  )
}
