'use client'

import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'

export function MembershipRefundSubmitButton({
  cancel,
  reconciliationPending,
  disabled,
}: {
  cancel: boolean
  reconciliationPending: boolean
  disabled: boolean
}) {
  const t = useTranslations()
  return (
    <Button
      type='submit'
      variant={cancel ? 'destructive' : 'default'}
      className='self-start'
      disabled={disabled}
      data-pw='membership-refund-submit-button'
    >
      {reconciliationPending
        ? t('extracted.admin.membershipRefundForm.reconcilingRefund_4a9345c2')
        : cancel
          ? t('extracted.admin.membershipRefundForm.refundRevokeAccess_4c8a2f19')
          : t('extracted.admin.membershipRefundForm.issueRefund_e91b3d55')}
    </Button>
  )
}
