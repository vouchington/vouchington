import Link from 'next/link'
import { getCrawlers } from '@/lib/api/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { createCrawlerPathname } from '@/lib/links/entity-href'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'

type Crawler = {
  id: string
  hostname_id: string
  description: string
  crawler_type: string
  priority: number
  created_at: string
}

export default async function CrawlersListPage() {
  const t = await getTranslations()
  await requireAdmin()

  const data = await getCrawlers<Crawler>({ limit: 100 })
  const { results: crawlers } = data

  return (
    <div>
      <div className='mb-6'>
        <h1
          className='text-xl font-semibold text-foreground'
          data-pw='crawlers-list-heading'
        >
          {t('extracted.crawlers.page.crawlers_9bb7d6d4')}
        </h1>
        <p className='mt-2 text-sm text-muted-foreground'>
          {t('extracted.crawlers.page.perHostnameCrawlConfigurations_6e0e4c28')}
        </p>
      </div>

      {crawlers.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('extracted.crawlers.page.noCrawlersConfigured_a9cd3593')}
        </p>
      ) : (
        <div className='overflow-hidden bg-card shadow-sm dark:shadow-none sm:rounded-lg'>
          <table
            className='w-full text-sm'
            data-pw='crawlers-table'
          >
            <thead>
              <tr className='border-b text-left text-muted-foreground'>
                <th
                  scope='col'
                  className='px-6 py-3 font-medium'
                >
                  {t('extracted.crawlers.page.id_3843971d')}
                </th>
                <th
                  scope='col'
                  className='px-6 py-3 font-medium'
                >
                  {t('extracted.crawlers.page.type_baaddf70')}
                </th>
                <th
                  scope='col'
                  className='px-6 py-3 font-medium'
                >
                  {t('extracted.crawlers.page.priority_d60dbba0')}
                </th>
                <th
                  scope='col'
                  className='px-6 py-3 font-medium'
                >
                  {t('extracted.crawlers.page.description_526e0087')}
                </th>
              </tr>
            </thead>
            <tbody className='divide-y divide-border'>
              {crawlers.map(crawler => (
                <tr
                  key={crawler.id}
                  className='relative hover:bg-muted/50'
                >
                  <td className='px-6 py-4 font-mono text-xs text-muted-foreground'>
                    <Link
                      href={createCrawlerPathname(crawler)}
                      prefetch={false}
                      className="after:absolute after:inset-0 after:content-[''] text-primary hover:underline"
                      data-pw='crawler-row'
                    >
                      {t('extracted.crawlers.page.id_4542e4bb', { id: crawler.id.slice(0, 8) })}
                    </Link>
                  </td>
                  <td className='px-6 py-4 text-foreground'>{crawler.crawler_type}</td>
                  <td className='px-6 py-4 text-foreground'>{crawler.priority}</td>
                  <td className='px-6 py-4 text-muted-foreground'>{crawler.description ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
