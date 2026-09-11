import Link from 'next/link'
import type { PublicUrl, UrlDetailResponseBody } from '@/types/api-responses'
import { TriggerUrlCrawlButton } from '@/components/urls/trigger-url-crawl-button'
import { domainHref } from '@/lib/links/entity-href'
import { getTranslations } from '@/lib/i18n/get-translations'

interface UrlAdminAsideProps {
  url: PublicUrl
  canTriggerCrawl: boolean
  urlType: UrlDetailResponseBody['url_type']
  rssFeedId: string | null
}

export async function UrlAdminAside({
  url,
  canTriggerCrawl,
  urlType,
  rssFeedId,
}: UrlAdminAsideProps) {
  const t = await getTranslations()
  return (
    <div className='rounded-lg border bg-card p-4 text-card-foreground shadow-sm'>
      <h3 className='mb-3 text-sm font-semibold text-foreground'>
        {t('extracted.urls.urlAdminAside.url_e7a241de')}
      </h3>
      <div className='space-y-3'>
        {url.hostname && (
          <div>
            <p className='text-xs font-medium text-muted-foreground'>
              {t('extracted.urls.urlAdminAside.hostname_2db53355')}
            </p>
            <Link
              prefetch={false}
              href={domainHref(url.hostname)}
              className='text-sm text-primary hover:text-primary/80'
            >
              {url.hostname.hostname}
            </Link>
          </div>
        )}
        {canTriggerCrawl && (
          <TriggerUrlCrawlButton
            id={url.id}
            urlType={urlType}
            rssFeedId={rssFeedId}
          />
        )}
      </div>
    </div>
  )
}
