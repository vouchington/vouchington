'use client'

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
import type { ScheduledJob } from '@/lib/api/client/mq'
import { useTranslations } from '@/lib/i18n/use-translations'

export function ScheduledJobTriggerDialog({
  onConfirm,
  onPendingJobChange,
  pendingJob,
}: {
  onConfirm: () => void
  onPendingJobChange: (job: ScheduledJob | null) => void
  pendingJob: ScheduledJob | null
}) {
  const t = useTranslations()
  return (
    <AlertDialog
      open={pendingJob !== null}
      onOpenChange={(open: boolean) => {
        if (!open) onPendingJobChange(null)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('extracted.queues.scheduledJobTriggerDialog.triggerDescription_b56c1359', {
              description: pendingJob?.description ?? '',
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              'extracted.queues.scheduledJobTriggerDialog.thisWillImmediatelyEnqueueTheJobname_2a41ab47',
              {
                jobName: pendingJob?.job_name ?? '',
                queueName: pendingJob?.queue_name ?? '',
                schedule: pendingJob?.schedule ?? '',
              },
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {t('extracted.queues.scheduledJobTriggerDialog.cancel_19766ed6')}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {t('extracted.queues.scheduledJobTriggerDialog.trigger_8b9c6437')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
