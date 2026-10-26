import Link from 'next/link'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminTableShell } from '@/components/admin/admin-table-shell'
import { PageWithAside } from '@/components/page-with-aside'
import { getCrawlers } from '@/lib/api/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getTranslations } from '@/lib/i18n/get-translations'
import { domainHref } from '@/lib/links/entity-href'

export const dynamic = 'force-dynamic'

type Crawler = {
  id: string
  hostname_id: string
  hostname: string
  description: string
  crawler_type: string
  priority: number
  created_at: string
}

export default async function CrawlersListPage() {
  const t = await getTranslations()
  await requireAdmin()
  const title = t('extracted.crawlers.page.crawlers_9bb7d6d4')

  const data = await getCrawlers<Crawler>({ limit: 100 })
  const { results: crawlers } = data
  const columns = [
    t('extracted.crawlers.page.hostname_2db53355'),
    t('extracted.crawlers.page.type_baaddf70'),
    t('extracted.crawlers.page.priority_d60dbba0'),
    t('extracted.crawlers.page.description_526e0087'),
  ]

  return (
    <PageWithAside showFooter={false}>
      <div className='space-y-4'>
        <AdminPageHeader
          dataPw='crawlers-list-heading'
          description={t('extracted.crawlers.page.perHostnameCrawlConfigurations_6e0e4c28')}
          title={title}
        />
        <AdminTableShell
          aria-label={title}
          emptyMessage={t('extracted.crawlers.page.noCrawlersConfigured_a9cd3593')}
          isEmpty={crawlers.length === 0}
        >
          {crawlers.length === 0 ? null : (
            <table
              className='min-w-full divide-y divide-border'
              data-pw='crawlers-table'
            >
              <thead className='bg-muted/50'>
                <tr>
                  {columns.map(column => (
                    <th
                      key={column}
                      scope='col'
                      className='px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className='divide-y divide-border bg-card'>
                {crawlers.map(crawler => (
                  <tr
                    key={crawler.id}
                    className='relative hover:bg-muted/50'
                  >
                    <td className='whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground'>
                      <Link
                        href={domainHref(crawler.hostname)}
                        prefetch={false}
                        className="after:absolute after:inset-0 after:content-[''] text-primary hover:underline"
                        data-pw='crawler-row'
                      >
                        {crawler.hostname}
                      </Link>
                    </td>
                    <td className='px-4 py-3 text-sm text-foreground'>{crawler.crawler_type}</td>
                    <td className='px-4 py-3 text-sm text-foreground'>{crawler.priority}</td>
                    <td className='px-4 py-3 text-sm text-muted-foreground'>
                      {crawler.description ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminTableShell>
      </div>
    </PageWithAside>
  )
}
