'use client'

import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'

export function MembershipRefundSubmitButton({
  cancel,
  cancellationPending,
  disabled,
}: {
  cancel: boolean
  cancellationPending: boolean
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
      {cancellationPending
        ? t('extracted.admin.membershipRefundForm.retryAccessRevocation_046f1af8')
        : cancel
          ? t('extracted.admin.membershipRefundForm.refundRevokeAccess_4c8a2f19')
          : t('extracted.admin.membershipRefundForm.issueRefund_e91b3d55')}
    </Button>
  )
}
