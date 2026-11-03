'use client'

import { useEffect, useState } from 'react'
import { getCommunityApplication } from '@/lib/api/client'
import type { CommunityApplication } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'

interface ApplicationDetailProps {
  communitySlug: string
  applicationId: string
}

/** Loads the answers and full message of one application when its row is opened. */
export function ApplicationDetail({ communitySlug, applicationId }: ApplicationDetailProps) {
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
        className='mt-3 text-sm text-destructive'
      >
        {t('extracted.communities.applicationReview.failedToLoadApplicationDetails_f24b23da')}
      </p>
    )
  }
  if (!application) return null

  return (
    <div className='mt-3 space-y-2'>
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
