'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { getCommunityApplication } from '@/lib/api/client'
import type { CommunityApplication } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'

interface ApplicationDetailProps {
  communitySlug: string
  applicationId: string
}

interface ApplicationDetailDialogProps extends ApplicationDetailProps {
  applicantLabel: string
  appliedDate: string
  onClose: () => void
}

/** Loads the answers and full message of one application when its dialog opens. */
function ApplicationDetail({ communitySlug, applicationId }: ApplicationDetailProps) {
  const t = useTranslations()
  const [application, setApplication] = useState<CommunityApplication | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    getCommunityApplication(communitySlug, applicationId)
      .then(body => {
        if (!cancelled) setApplication(body.community_application)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [communitySlug, applicationId])

  if (failed) {
    return (
      <p
        role='alert'
        className='text-sm text-destructive'
      >
        {t('extracted.communities.applicationReview.failedToLoadApplicationDetails_f24b23da')}
      </p>
    )
  }
  if (!application) {
    return (
      <div className='flex justify-center py-6'>
        <Spinner />
      </div>
    )
  }

  return (
    <div className='space-y-2'>
      {Object.entries(application.answers).map(([key, value]) => (
        <div key={key}>
          <p className='text-xs font-medium text-muted-foreground'>{key}</p>
          <p className='text-sm'>{String(value)}</p>
        </div>
      ))}
      {application.message && (
        <div>
          <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
            {t('extracted.communities.applicationReview.message_2f77668a')}
          </p>
          <p className='mt-1 whitespace-pre-wrap break-words text-sm'>{application.message}</p>
        </div>
      )}
    </div>
  )
}

export function ApplicationDetailDialog({
  communitySlug,
  applicationId,
  applicantLabel,
  appliedDate,
  onClose,
}: ApplicationDetailDialogProps) {
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{applicantLabel}</DialogTitle>
          <DialogDescription suppressHydrationWarning>{appliedDate}</DialogDescription>
        </DialogHeader>
        <ApplicationDetail
          communitySlug={communitySlug}
          applicationId={applicationId}
        />
      </DialogContent>
    </Dialog>
  )
}
