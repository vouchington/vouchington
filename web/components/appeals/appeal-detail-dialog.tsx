'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toModerationAppealSummary, type ModerationAppeal } from '@/types/appeals'
import { useTranslations } from '@/lib/i18n/use-translations'
import { AppealContext } from './appeal-context'
import { AppealDetail, type AppealDetailActions } from './appeal-detail'

interface AppealDetailDialogProps extends AppealDetailActions {
  appeal: ModerationAppeal | null
  onClose: () => void
}

/** Staff review one appeal here: the reason, the original decision, the AI draft and every action. */
export function AppealDetailDialog({ appeal, onClose, ...actions }: AppealDetailDialogProps) {
  const t = useTranslations()
  return (
    <Dialog
      open={appeal !== null}
      onOpenChange={open => {
        if (!open) onClose()
      }}
    >
      <DialogContent data-pw='appeal-detail-dialog'>
        <DialogHeader>
          <DialogTitle>{t('extracted.appeals.appealRow.review_aff0766a')}</DialogTitle>
          <DialogDescription>
            {t(
              'extracted.appeals.appealDetailDialog.reviewThisAppealAndDecideHowToRespond_1f11d4d3',
            )}
          </DialogDescription>
        </DialogHeader>
        {appeal ? (
          <>
            <AppealContext appeal={toModerationAppealSummary(appeal)} />
            <AppealDetail
              appeal={appeal}
              {...actions}
            />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
