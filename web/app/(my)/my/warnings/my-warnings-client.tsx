'use client'

import Link from 'next/link'
import { TimeAgo } from '@/components/shared/time-ago'
import { AppealDialog } from '@/components/appeals/appeal-dialog'
import { communityHref } from '@/lib/links/entity-href'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { MyWarningViewModel } from './my-warnings-view-model'

interface MyWarningsClientProps {
  warnings: MyWarningViewModel[]
}

export function MyWarningsClient({ warnings }: MyWarningsClientProps) {
  const t = useTranslations()

  if (warnings.length === 0) {
    return (
      <p
        className='text-sm text-muted-foreground'
        data-pw='my-warnings-empty'
      >
        {t('extracted.warnings.myWarningsClient.youHaveNoWarningsOnYour_37dfc5d6')}
      </p>
    )
  }

  return (
    <ul
      className='space-y-4'
      data-pw='my-warnings-list'
    >
      {warnings.map(warning => (
        <li
          key={warning.id}
          className='rounded-md border bg-card p-4'
          data-pw='my-warning-item'
        >
          <div className='flex flex-wrap items-start justify-between gap-2'>
            <div className='flex flex-col gap-1'>
              {warning.communitySlug ? (
                <p className='text-xs text-muted-foreground'>
                  {t('extracted.warnings.myWarningsClient.community_a497fe96')}{' '}
                  <Link
                    href={communityHref({ slug: warning.communitySlug })}
                    className='underline'
                    prefetch={false}
                  >
                    {warning.communitySlug}
                  </Link>
                </p>
              ) : (
                <p className='text-xs text-muted-foreground'>
                  {t('extracted.warnings.myWarningsClient.siteWideWarning_553687ec')}
                </p>
              )}
            </div>
            <div className='flex items-center gap-3'>
              <time
                className='text-xs tabular-nums text-muted-foreground'
                data-pw='my-warning-date'
              >
                <TimeAgo date={warning.createdAt} />
              </time>
              <AppealDialog warningId={warning.id} />
            </div>
          </div>
          {warning.publicMessage ? (
            <p
              className='mt-2 whitespace-pre-wrap break-words text-sm'
              data-pw='my-warning-public-message'
            >
              {warning.publicMessage}
            </p>
          ) : (
            <p
              className='mt-2 text-sm text-muted-foreground'
              data-pw='my-warning-no-message'
            >
              {t('extracted.warnings.myWarningsClient.noAdditionalMessageWasProvided_fb3d10b6')}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}
