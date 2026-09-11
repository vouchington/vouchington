'use client'

import { ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'
import { DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface RssFeedItemModalHeaderProps {
  headerDetails?: ReactNode
  title: string
  titleUrl?: string
}

export function RssFeedItemModalHeader({
  headerDetails,
  title,
  titleUrl,
}: RssFeedItemModalHeaderProps) {
  const isSafeUrl = (url: string) => url.startsWith('https://') || url.startsWith('http://')
  return (
    <DialogHeader className='min-w-0 pr-8 text-left'>
      <DialogTitle
        className='min-w-0 text-left leading-snug'
        data-pw='rss-feed-item-modal-title'
      >
        {titleUrl !== undefined && isSafeUrl(titleUrl) ? (
          <a
            href={titleUrl}
            target='_blank'
            rel='nofollow noopener noreferrer'
            className='inline [overflow-wrap:anywhere] hover:underline'
            data-pw='rss-feed-item-modal-title-link'
          >
            {title}
            {' '}
            <ExternalLink className='inline-block h-4 w-4 shrink-0 align-baseline text-muted-foreground' />
          </a>
        ) : (
          title
        )}
      </DialogTitle>
      {headerDetails && <div className='mt-1'>{headerDetails}</div>}
    </DialogHeader>
  )
}
