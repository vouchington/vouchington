'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toReviewDisputeSummary, type ReviewDispute } from '@/types/review-disputes'
import { useTranslations } from '@/lib/i18n/use-translations'
import { DisputeContext } from './dispute-context'
import { DisputeDetail, type DisputeDetailActions } from './dispute-detail'

interface DisputeDetailDialogProps extends DisputeDetailActions {
  dispute: ReviewDispute | null
  onClose: () => void
}

/** Staff review one dispute here: the full claim, the AI draft and every action. */
export function DisputeDetailDialog({ dispute, onClose, ...actions }: DisputeDetailDialogProps) {
  const t = useTranslations()
  return (
    <Dialog
      open={dispute !== null}
      onOpenChange={open => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        data-pw='dispute-detail-dialog'
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>{t('extracted.disputes.disputesTable.review_aff0766a')}</DialogTitle>
        </DialogHeader>
        {dispute ? (
          <>
            <DisputeContext dispute={toReviewDisputeSummary(dispute)} />
            <DisputeDetail
              dispute={dispute}
              {...actions}
            />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
