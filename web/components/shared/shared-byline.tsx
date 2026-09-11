'use client'

import Link from 'next/link'
import { formatUtcDate } from '@ts-shared/utils/format'
import { cn } from '@/lib/utils'
import type { PublicUser } from '@/types/user'
import { UserOfficialBadge } from '@/components/shared/user-official-badge'
import { userHref } from '@/lib/links/entity-href'
import { useTranslations } from '@/lib/i18n/use-translations'

interface SharedBylineProps {
  sharedByUser?: Pick<PublicUser, 'id' | 'username' | 'is_official_account'>
  sharedAt?: string
  className?: string
}

export function SharedByline({ sharedByUser, sharedAt, className }: SharedBylineProps) {
  const t = useTranslations()
  if (!sharedByUser?.username) return null

  return (
    <div className={cn('flex items-center gap-1 text-xs text-muted-foreground', className)}>
      <span data-pw='shared-byline-label'>
        {t('extracted.shared.sharedByline.sharedBy_09e58975')}
      </span>
      <Link
        prefetch={false}
        href={userHref(sharedByUser)}
        className='font-medium hover:text-foreground'
        data-pw='shared-byline-user-link'
      >
        @{sharedByUser.username}
      </Link>
      <UserOfficialBadge isOfficial={sharedByUser.is_official_account} />
      {sharedAt ? <span>· {formatUtcDate(sharedAt)}</span> : null}
    </div>
  )
}
