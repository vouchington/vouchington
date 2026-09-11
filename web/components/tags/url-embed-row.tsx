'use client'

import { ProxiedImage as Image } from '@/components/shared/proxied-image'
import { ExternalLink } from 'lucide-react'
import { formatDomainForDisplay } from '@ts-shared/utils/format'

interface LatestCrawl {
  title?: string | null
  image_url?: string | null
}

interface UrlEmbedRowProps {
  url: string
  latestCrawl?: LatestCrawl | null
}

export function UrlEmbedRow({ url, latestCrawl }: UrlEmbedRowProps) {
  const isSafe = url.startsWith('https://') || url.startsWith('http://')
  const title = latestCrawl?.title ?? null

  let displayDomain = url
  let displayUrl = url
  try {
    const parsed = new URL(url)
    displayDomain = formatDomainForDisplay(parsed.hostname)
    const path = parsed.pathname.replace(/\/$/, '')
    displayUrl = displayDomain + path + (parsed.search || '')
  } catch {
    // invalid URL — use raw string
  }

  const inner = (
    <>
      {title && latestCrawl?.image_url && (
        <Image
          src={latestCrawl.image_url}
          alt=''
          width={64}
          height={40}
          unoptimized
          className='h-10 w-16 shrink-0 rounded bg-muted object-cover'
        />
      )}
      <div className='min-w-0'>
        {title ? (
          <>
            <p className='line-clamp-2 text-sm'>{title}</p>
            <p className='text-xs text-muted-foreground'>({displayDomain})</p>
          </>
        ) : (
          <p className='flex min-w-0 items-center gap-1 text-sm'>
            <ExternalLink className='h-3 w-3 shrink-0 text-muted-foreground' />
            <span className='truncate'>{displayUrl}</span>
          </p>
        )}
      </div>
    </>
  )

  if (!isSafe) {
    return <div className='flex min-w-0 gap-2'>{inner}</div>
  }

  return (
    <a
      href={url}
      target='_blank'
      rel='noopener noreferrer nofollow'
      className='flex min-w-0 gap-2 hover:underline'
      data-pw='url-embed-row'
    >
      {inner}
    </a>
  )
}
