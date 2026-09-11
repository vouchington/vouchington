'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { unlinkValidationFromReferralProgram } from '@/lib/api/client/referral-link-validations'
import onError, { onSuccess } from '@/lib/on-error'
import { useTranslations } from '@/lib/i18n/use-translations'

interface UnlinkValidationButtonProps {
  referralProgramId: string
  validationId: string
  slug: string
}

export function UnlinkValidationButton({
  referralProgramId,
  validationId,
  slug,
}: UnlinkValidationButtonProps) {
  const t = useTranslations()
  const { refresh } = useRouter()
  const [unlinking, setUnlinking] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  async function handleUnlink() {
    setShowConfirm(false)
    setUnlinking(true)
    try {
      await unlinkValidationFromReferralProgram(referralProgramId, validationId)
      onSuccess(
        t('extracted.validations.unlinkValidationButton.unlinkedValidationSlug_857a55f6', {
          slug,
        }),
      )
      refresh()
    } catch (error) {
      onError(error, {
        fallback: t(
          'extracted.validations.unlinkValidationButton.failedToUnlinkValidation_99c0a366',
        ),
      })
      setUnlinking(false)
    }
  }

  return (
    <>
      <Button
        size='sm'
        variant='destructive'
        loading={unlinking}
        disabled={unlinking}
        onClick={() => setShowConfirm(true)}
        // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
        data-pw={`unlink-validation-${validationId}`}
      >
        {unlinking
          ? t('extracted.validations.unlinkValidationButton.unlinking_eb4e0835')
          : t('extracted.validations.unlinkValidationButton.unlink_b90108da')}
      </Button>

      <AlertDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('extracted.validations.unlinkValidationButton.unlinkValidation_cce7a559')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'extracted.validations.unlinkValidationButton.usersSubmittingReferralLinksForThis_3b888e86',
                {
                  slug,
                },
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t('extracted.validations.unlinkValidationButton.cancel_19766ed6')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnlink}
              data-pw='unlink-validation-confirm'
            >
              {t('extracted.validations.unlinkValidationButton.unlink_b90108da')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
