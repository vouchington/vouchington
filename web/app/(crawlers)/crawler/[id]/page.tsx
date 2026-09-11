import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { createCrawlerPathname } from '@/lib/links/entity-href'
import { getCrawler } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { getTranslations } from '@/lib/i18n/get-translations'
export const dynamic = 'force-dynamic'

export default async function CrawlerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations()
  const { id } = await params
  const [data, currentUser] = await Promise.all([
    getCrawler<{ crawler: any }>(id),
    getCurrentUser(),
  ])
  if (!data) notFound()
  const { crawler } = data
  const crawlerPath = createCrawlerPathname({ id })

  return (
    <div>
      <Breadcrumbs
        items={buildBreadcrumbsForPath(crawlerPath, {
          isAuthenticated: !!currentUser,
          tail: [{ name: 'Crawler Details', path: crawlerPath }],
        })}
      />
      <div className='mb-8 flex justify-between items-center'>
        <div>
          <h1
            data-pw='crawler-detail-heading'
            className='text-xl font-semibold text-foreground'
          >
            {t('extracted.id.page.crawlerDetails_5a80f2a4')}
          </h1>
          <p className='mt-2 text-sm text-muted-foreground'>
            {t('extracted.id.page.configurationForThisCrawler_e5b4bfb0')}
          </p>
        </div>
        <Link
          prefetch={false}
          href={createCrawlerPathname({ id }, '/edit')}
          data-pw='crawler-edit-link'
          className='rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90'
        >
          {t('extracted.id.page.editCrawler_64ab1969')}
        </Link>
      </div>

      <div className='overflow-hidden bg-card shadow-sm dark:shadow-none sm:rounded-lg'>
        <div className='px-4 py-5 sm:px-6'>
          <h3 className='text-lg font-medium leading-6 text-foreground'>
            {t('extracted.id.page.crawlerConfiguration_6c81a8ac')}
          </h3>
        </div>
        <div className='border-t px-4 py-5 sm:px-6'>
          <dl className='grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2'>
            <div>
              <dt className='text-sm font-medium text-muted-foreground'>
                {t('extracted.id.page.crawlerType_87b41c0e')}
              </dt>
              <dd className='mt-1 text-sm text-foreground'>{crawler.crawler_type}</dd>
            </div>
            <div>
              <dt className='text-sm font-medium text-muted-foreground'>
                {t('extracted.id.page.priority_d60dbba0')}
              </dt>
              <dd className='mt-1 text-sm text-foreground'>{crawler.priority}</dd>
            </div>
            <div className='sm:col-span-2'>
              <dt className='text-sm font-medium text-muted-foreground'>
                {t('extracted.id.page.description_526e0087')}
              </dt>
              <dd className='mt-1 text-sm text-foreground'>{crawler.description}</dd>
            </div>
            <div className='sm:col-span-2'>
              <dt className='text-sm font-medium text-muted-foreground'>
                {t('extracted.id.page.cssSelectorsToRemove_6837d468')}
              </dt>
              <dd className='mt-1 text-sm text-foreground'>
                {crawler.css_selectors_to_remove.length > 0 ? (
                  <ul className='list-disc pl-5'>
                    {crawler.css_selectors_to_remove.map((selector: string) => (
                      <li key={selector}>{selector}</li>
                    ))}
                  </ul>
                ) : (
                  <span className='text-muted-foreground'>
                    {t('extracted.id.page.none_dc937b59')}
                  </span>
                )}
              </dd>
            </div>
            <div className='sm:col-span-2'>
              <dt className='text-sm font-medium text-muted-foreground'>
                {t('extracted.id.page.linkTextContentToRemove_90e2892e')}
              </dt>
              <dd className='mt-1 text-sm text-foreground'>
                {crawler.link_text_content_to_remove.length > 0 ? (
                  <ul className='list-disc pl-5'>
                    {crawler.link_text_content_to_remove.map((text: string) => (
                      <li key={text}>{text}</li>
                    ))}
                  </ul>
                ) : (
                  <span className='text-muted-foreground'>
                    {t('extracted.id.page.none_dc937b59')}
                  </span>
                )}
              </dd>
            </div>
            <div className='sm:col-span-2'>
              <dt className='text-sm font-medium text-muted-foreground'>
                {t('extracted.id.page.linkHrefsToRemove_c98241e5')}
              </dt>
              <dd className='mt-1 text-sm text-foreground'>
                {crawler.link_hrefs_to_remove.length > 0 ? (
                  <ul className='list-disc pl-5'>
                    {crawler.link_hrefs_to_remove.map((href: string) => (
                      <li key={href}>{href}</li>
                    ))}
                  </ul>
                ) : (
                  <span className='text-muted-foreground'>
                    {t('extracted.id.page.none_dc937b59')}
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}
