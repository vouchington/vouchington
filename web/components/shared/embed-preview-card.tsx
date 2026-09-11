'use client'

import { ProxiedImage as Image } from '@/components/shared/proxied-image'
import { VideoEmbed } from '@/components/feed/video-embed'
import { Button } from '@/components/ui/button'
import type { EmbedPreview } from '@/lib/embeds/embed-preview'
import { useTranslations } from '@/lib/i18n/use-translations'

interface EmbedPreviewCardProps {
  preview: EmbedPreview
  /** Video playback remains restricted to the existing final iframe-boundary allowlist. */
  showPlayer?: boolean
  /** Detail pages promote article thumbnails without changing compact list/card previews. */
  layout?: 'compact' | 'hero'
  className?: string
}

function isHttpsUrl(url: string | null): url is string {
  if (!url) return false
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

export function EmbedPreviewCard({
  preview,
  showPlayer = false,
  layout = 'compact',
  className,
}: EmbedPreviewCardProps) {
  const t = useTranslations()
  const hasContent =
    preview.title ||
    preview.description ||
    preview.provider ||
    preview.thumbnailUrl ||
    preview.playerUrl ||
    isHttpsUrl(preview.sourceUrl)
  if (!hasContent) return null

  if (showPlayer && preview.playerUrl && preview.platform) {
    return (
      <div className={`space-y-2 ${className ?? ''}`.trim()}>
        <VideoEmbed
          platform={preview.platform}
          playerUrl={preview.playerUrl}
          thumbnailUrl={preview.thumbnailUrl ?? undefined}
          title={preview.title ?? undefined}
          itemUrl={preview.sourceUrl ?? undefined}
        />
        {isHttpsUrl(preview.sourceUrl) && (
          <Button
            asChild
            variant='link'
            size='sm'
            className='h-auto px-0 text-sm'
          >
            <a
              href={preview.sourceUrl}
              target='_blank'
              rel='nofollow ugc noopener noreferrer'
            >
              {t('extracted.shared.embedPreviewCard.openSource_67a0d2e0')}
            </a>
          </Button>
        )}
      </div>
    )
  }

  const hero = layout === 'hero'

  return (
    <div
      className={`rounded-md border bg-muted/30 p-3 ${hero ? 'space-y-3' : 'flex gap-3'} ${className ?? ''}`.trim()}
    >
      {preview.thumbnailUrl && (
        <Image
          src={preview.thumbnailUrl}
          alt=''
          width={hero ? 640 : 128}
          height={hero ? 360 : 80}
          className={
            hero
              ? 'aspect-video w-full rounded object-cover'
              : 'h-20 w-32 shrink-0 rounded object-cover'
          }
          loading='lazy'
          decoding='async'
        />
      )}
      <div className='min-w-0 flex-1 space-y-1'>
        {preview.provider && <p className='text-xs text-muted-foreground'>{preview.provider}</p>}
        {preview.title && <p className='line-clamp-2 text-sm font-medium'>{preview.title}</p>}
        {preview.description && (
          <p className='line-clamp-2 text-sm text-muted-foreground'>{preview.description}</p>
        )}
        {isHttpsUrl(preview.sourceUrl) && (
          <Button
            asChild
            variant='link'
            size='sm'
            className='h-auto px-0 text-sm'
          >
            <a
              href={preview.sourceUrl}
              target='_blank'
              rel='nofollow ugc noopener noreferrer'
            >
              {t('extracted.shared.embedPreviewCard.openSource_67a0d2e0')}
            </a>
          </Button>
        )}
      </div>
    </div>
  )
}
