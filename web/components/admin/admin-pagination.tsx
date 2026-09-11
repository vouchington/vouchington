'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'

interface AdminPaginationProps {
  nextHref?: string | null
  previousHref?: string | null
}

export function AdminPagination({ nextHref, previousHref }: AdminPaginationProps) {
  const t = useTranslations()
  if (!previousHref && !nextHref) return null

  return (
    <nav
      aria-label={t('extracted.admin.adminPagination.adminPagination_47ae3310')}
      data-pw='admin-pagination'
      className='flex flex-wrap gap-2'
    >
      {previousHref ? (
        <Button
          asChild
          size='touchSm'
          variant='outline'
        >
          <Link
            prefetch={false}
            href={previousHref}
          >
            {t('extracted.admin.adminPagination.previous_a57b08a4')}
          </Link>
        </Button>
      ) : null}
      {nextHref ? (
        <Button
          asChild
          size='touchSm'
          variant='outline'
        >
          <Link
            prefetch={false}
            href={nextHref}
          >
            {t('extracted.admin.adminPagination.next_1ff57a29')}
          </Link>
        </Button>
      ) : null}
    </nav>
  )
}
