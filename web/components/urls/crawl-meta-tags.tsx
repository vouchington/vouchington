import { EmbedPreviewCard } from '@/components/shared/embed-preview-card'
import type { getTranslations } from '@/lib/i18n/get-translations'
import { selectCrawlEmbedPreview } from '@/lib/embeds/embed-preview'
import type { CrawlResponse } from '@/types/api-responses/urls-onboarding-and-trends'
import type { CrawlerHtmlStructuredObject } from '@/types/api-responses/posts-topics-and-feeds'

interface Props {
  t: Awaited<ReturnType<typeof getTranslations>>
  meta: CrawlerHtmlStructuredObject
  lang: string | null
  ogImageSideload?: string | null
  embedMetadata?: CrawlResponse['embed_metadata']
  crawlTitle?: string | null
}

export function CrawlMetaTags({
  t,
  meta,
  lang,
  ogImageSideload,
  embedMetadata,
  crawlTitle,
}: Props) {
  if (Object.keys(meta).length === 0 && !lang && !embedMetadata) return null

  const ogImage = ogImageSideload ?? null
  const preview = selectCrawlEmbedPreview({
    embedMetadata: embedMetadata ?? null,
    metaTags: meta,
    title: crawlTitle ?? null,
    safeThumbnailUrl: ogImage,
  })
  // canonical comes from <link rel="canonical">, not stored in meta_tags — omit here
  const robots = typeof meta['robots'] === 'string' ? meta['robots'] : null
  const viewport = typeof meta['viewport'] === 'string' ? meta['viewport'] : null
  const themeColor = typeof meta['theme-color'] === 'string' ? meta['theme-color'] : null

  const hasFeaturedRow =
    ogImage ||
    preview.title ||
    preview.description ||
    preview.provider ||
    preview.sourceUrl ||
    lang ||
    robots ||
    viewport ||
    themeColor

  const sortedEntries = Object.entries(meta).toSorted(([a], [b]) => a.localeCompare(b))

  return (
    <div className='mb-8 overflow-hidden bg-card shadow-sm dark:shadow-none sm:rounded-lg'>
      <div className='px-4 py-5 sm:px-6'>
        <h2 className='text-lg font-medium leading-6 text-foreground'>
          {t('extracted.urls.crawlMetaTags.metaTags_cf8458e2')}
        </h2>
      </div>

      {hasFeaturedRow && (
        <div className='border-t px-4 py-5 sm:px-6'>
          {(preview.title ||
            preview.description ||
            preview.provider ||
            preview.thumbnailUrl ||
            preview.playerUrl ||
            preview.sourceUrl) && (
            <EmbedPreviewCard
              preview={preview}
              showPlayer
              className='mb-6'
            />
          )}
          <dl className='grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2'>
            {lang && (
              <div>
                <dt className='text-sm font-medium text-muted-foreground'>
                  {t('extracted.urls.crawlMetaTags.language_a4fe6526')}
                </dt>
                <dd className='mt-1 text-sm text-foreground'>{lang}</dd>
              </div>
            )}
            {robots && (
              <div>
                <dt className='text-sm font-medium text-muted-foreground'>
                  {t('extracted.urls.crawlMetaTags.robots_7162608e')}
                </dt>
                <dd className='mt-1 text-sm text-foreground'>{robots}</dd>
              </div>
            )}
            {viewport && (
              <div>
                <dt className='text-sm font-medium text-muted-foreground'>
                  {t('extracted.urls.crawlMetaTags.viewport_91e53b90')}
                </dt>
                <dd className='mt-1 text-sm text-foreground'>{viewport}</dd>
              </div>
            )}
            {themeColor && (
              <div>
                <dt className='text-sm font-medium text-muted-foreground'>
                  {t('extracted.urls.crawlMetaTags.themeColor_d543a86f')}
                </dt>
                <dd className='mt-1 text-sm text-foreground'>{themeColor}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {sortedEntries.length > 0 && (
        <details className='border-t px-4 py-5 sm:px-6'>
          <summary className='cursor-pointer text-sm font-medium text-muted-foreground'>
            {t('extracted.urls.crawlMetaTags.allMetaTags_15f82a82')}
          </summary>
          <dl className='mt-4 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2'>
            {sortedEntries.map(([key, value]) => (
              <div key={key}>
                <dt className='text-xs font-medium text-muted-foreground'>{key}</dt>
                <dd className='mt-0.5 break-all text-sm text-foreground'>
                  {value === null
                    ? t('extracted.urls.crawlMetaTags.null_2874d780')
                    : typeof value === 'object'
                      ? JSON.stringify(value)
                      : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  )
}
