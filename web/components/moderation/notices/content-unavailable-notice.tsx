'use client'

import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useTranslations } from '@/lib/i18n/use-translations'

/**
 * Shown in place of post content when the post has been removed by a moderator
 * and the viewer is neither the author nor a member of moderation staff.
 */
export function ContentUnavailableNotice() {
  const t = useTranslations()
  return (
    <Alert>
      <AlertCircle className='h-4 w-4' />
      <AlertDescription>
        {t('extracted.notices.contentUnavailableNotice.thisContentIsUnavailable_270ebb27')}
      </AlertDescription>
    </Alert>
  )
}
