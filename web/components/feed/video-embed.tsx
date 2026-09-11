'use client'

import { useState } from 'react'
import { ProxiedImage as Image } from '@/components/shared/proxied-image'
import { Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDidHydrate } from '@/hooks/use-did-hydrate'
import { useTranslations } from '@/lib/i18n/use-translations'

interface VideoEmbedProps {
  platform: string
  playerUrl?: string | null
  videoId?: string
  thumbnailUrl?: string
  title?: string
  itemUrl?: string
}

function isSafeExternalUrl(url: string | undefined): url is string {
  if (!url) return false
  return url.startsWith('https://') || url.startsWith('http://')
}

function legacyPlayerUrl(platform: string, videoId: string | undefined): string | undefined {
  if (!videoId) return undefined
  if (platform === 'youtube') {
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`
  }
  if (platform === 'vimeo') {
    return `https://player.vimeo.com/video/${encodeURIComponent(videoId)}`
  }
  return undefined
}

function authorizedPlayerUrl(
  platform: string,
  url: string | null | undefined,
  videoId: string | undefined,
): string | undefined {
  // Rows persisted before player_url was introduced retain the already-normalized provider ID.
  if (url === undefined) return legacyPlayerUrl(platform, videoId)
  if (url === null) return undefined
  try {
    const parsed = new URL(url)
    const authority = /^https:\/\/([^/?#]+)/.exec(url)?.[1]
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      authority !== parsed.hostname
    ) {
      return undefined
    }
    if (
      (platform === 'youtube' &&
        parsed.origin === 'https://www.youtube-nocookie.com' &&
        parsed.pathname.startsWith('/embed/')) ||
      (platform === 'vimeo' &&
        parsed.origin === 'https://player.vimeo.com' &&
        parsed.pathname.startsWith('/video/'))
    ) {
      return parsed.toString()
    }
  } catch {
    // Fall through to the external-link presentation.
  }
  return undefined
}

export function VideoEmbed({
  platform,
  playerUrl,
  videoId,
  thumbnailUrl,
  title,
  itemUrl,
}: VideoEmbedProps) {
  const t = useTranslations()
  const [expanded, setExpanded] = useState(false)
  const isHydrated = useDidHydrate()
  // The API authorizes player URLs; this allowlist is a final defense at the iframe boundary.
  const embedUrl = authorizedPlayerUrl(platform, playerUrl, videoId)
  const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1)
  const safeItemUrl = isSafeExternalUrl(itemUrl) ? itemUrl : undefined

  if (!embedUrl) {
    return (
      <div className='rounded-md border bg-muted/30 p-4'>
        {thumbnailUrl && (
          <Image
            src={thumbnailUrl}
            alt={title ?? ''}
            width={640}
            height={360}
            unoptimized
            className='mb-2 w-full rounded object-cover'
          />
        )}
        {safeItemUrl && (
          <a
            href={safeItemUrl}
            target='_blank'
            rel='nofollow noopener noreferrer'
            className='text-sm text-primary hover:underline'
          >
            {t('extracted.feed.videoEmbed.watchOnPlatformlabel_e12193fa', { platformLabel })}
          </a>
        )}
      </div>
    )
  }

  const videoTitle = title || t('extracted.feed.videoEmbed.video_d534be82')

  if (expanded) {
    return (
      <div className='aspect-video overflow-hidden rounded-md border'>
        {/* oxlint-disable react/iframe-missing-sandbox -- allow-same-origin is safe here: src is always an API-authorized cross-origin URL rechecked against youtube-nocookie.com/player.vimeo.com, and CSP frame-src pins both origins */}
        <iframe
          src={embedUrl}
          title={videoTitle}
          className='h-full w-full'
          allowFullScreen
          sandbox='allow-scripts allow-same-origin allow-presentation allow-popups'
          allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
          loading='lazy'
        />
        {/* oxlint-enable react/iframe-missing-sandbox */}
      </div>
    )
  }

  return (
    <div className='relative overflow-hidden rounded-md border bg-muted/30'>
      {thumbnailUrl ? (
        <Image
          src={thumbnailUrl}
          alt={title ?? ''}
          width={640}
          height={360}
          unoptimized
          className='aspect-video w-full object-cover'
        />
      ) : (
        <div className='flex aspect-video items-center justify-center bg-muted' />
      )}
      <Button
        type='button'
        variant='secondary'
        size='icon'
        className='absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-14 w-14 rounded-full opacity-90 hover:opacity-100'
        onClick={() => setExpanded(true)}
        aria-label={t('extracted.feed.videoEmbed.playTitle_64010fec', { title: videoTitle })}
        disabled={!isHydrated}
        data-pw='video-embed-play-button'
      >
        <Play className='h-6 w-6' />
      </Button>
    </div>
  )
}
