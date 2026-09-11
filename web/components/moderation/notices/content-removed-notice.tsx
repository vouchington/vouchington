'use client'

import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useTranslations } from '@/lib/i18n/use-translations'

/**
 * Shown in place of post content when the authenticated viewer is the post
 * author and the post has been removed by a moderator (clearance_status ===
 * 'rejected' with no self-delete).
 *
 * The caller is responsible for the render-gate condition:
 *   post.clearance_status === 'rejected' && currentUserId === post.created_by_id
 */
export function ContentRemovedNotice({ reason }: { reason?: string | null } = {}) {
  const t = useTranslations()
  return (
    <div data-pw='content-removed-notice'>
      <Alert variant='destructive'>
        <ShieldAlert className='h-4 w-4' />
        <AlertTitle>
          {t('extracted.notices.contentRemovedNotice.thisContentWasRemovedByA_6efead63')}
        </AlertTitle>
        <AlertDescription className='flex flex-wrap items-center gap-x-1'>
          {reason ? (
            <span>{reason}</span>
          ) : (
            <span>
              {t('extracted.notices.contentRemovedNotice.noAdditionalReasonWasProvided_bb383819')}
            </span>
          )}
          <Link
            href='/my/appeals'
            className='font-medium underline'
            prefetch={false}
          >
            {t('extracted.notices.contentRemovedNotice.viewAppeals_bd15ce13')}
          </Link>
        </AlertDescription>
      </Alert>
    </div>
  )
}
