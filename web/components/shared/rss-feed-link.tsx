'use client'

import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { EntityActionIcons } from './entity-action-icons'
import { useTranslations } from '@/lib/i18n/use-translations'

interface RssFeedLinkProps {
  href: string
  label?: string
  withLabel?: boolean
  asButton?: boolean
  'data-pw'?: string
}

export function RssFeedLink({
  href,
  label,
  withLabel = false,
  asButton = false,
  'data-pw': dataPw = 'rss-feed-link',
}: RssFeedLinkProps) {
  const t = useTranslations()
  const resolvedLabel = label ?? t('extracted.shared.rssFeedLink.source_0e570ca6')
  /* c8 ignore next -- icon alias is covered by Vitest; selected browser coverage does not visit RSS links */
  const RssFeedIcon = EntityActionIcons.rssFeed

  return (
    <a
      href={href}
      target='_blank'
      rel='nofollow noopener noreferrer'
      title={resolvedLabel}
      aria-label={resolvedLabel}
      className={
        asButton
          ? cn(buttonVariants({ variant: 'outline', size: 'touchSm' }), 'gap-2')
          : cn(
              'inline-flex items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
              withLabel
                ? 'min-h-11 w-full justify-start gap-2 px-2 text-sm'
                : 'size-11 justify-center',
            )
      }
      data-pw={dataPw}
    >
      <RssFeedIcon className='h-4 w-4 shrink-0' />
      {(asButton || withLabel) && <span>{resolvedLabel}</span>}
    </a>
  )
}
