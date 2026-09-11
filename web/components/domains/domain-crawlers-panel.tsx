'use client'

import Link from 'next/link'
import { createCrawlerPathname } from '@/lib/links/entity-href'
import type { ViewCrawler } from '@/types/hostnames'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  crawlers: ViewCrawler[]
}

export default function DomainCrawlersPanel({ crawlers }: Props) {
  const t = useTranslations()

  return (
    <section className='space-y-4'>
      <h2 className='text-lg font-semibold tracking-tight'>
        {t('extracted.domains.domainCrawlersPanel.crawlers_9bb7d6d4')}
      </h2>
      {crawlers.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('extracted.domains.domainCrawlersPanel.noCrawlersConfiguredForThisHostname_ba9fc671')}
        </p>
      ) : (
        <div className='overflow-hidden rounded-md border bg-card'>
          <table className='min-w-full divide-y divide-border'>
            <thead className='bg-muted/50'>
              <tr>
                <th
                  scope='col'
                  className='px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
                >
                  {t('extracted.domains.domainCrawlersPanel.description_526e0087')}
                </th>
                <th
                  scope='col'
                  className='px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
                >
                  {t('extracted.domains.domainCrawlersPanel.type_baaddf70')}
                </th>
                <th
                  scope='col'
                  className='px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
                >
                  {t('extracted.domains.domainCrawlersPanel.priority_d60dbba0')}
                </th>
                <th
                  scope='col'
                  className='px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
                >
                  {t('extracted.domains.domainCrawlersPanel.actions_ff8059dc')}
                </th>
              </tr>
            </thead>
            <tbody className='divide-y divide-border bg-card'>
              {crawlers.map(crawler => (
                <tr key={crawler.id}>
                  <td
                    data-pw='domain-crawler-description'
                    className='px-4 py-3 text-sm text-foreground'
                  >
                    {crawler.description}
                  </td>
                  <td className='whitespace-nowrap px-4 py-3 text-sm text-muted-foreground'>
                    {crawler.crawler_type}
                  </td>
                  <td className='whitespace-nowrap px-4 py-3 text-sm text-muted-foreground'>
                    {crawler.priority}
                  </td>
                  <td className='whitespace-nowrap px-4 py-3 text-sm'>
                    <Link
                      prefetch={false}
                      href={createCrawlerPathname(crawler)}
                      className='text-primary hover:text-primary/80'
                      // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
                      data-pw={`domain-crawler-view-${crawler.id}`}
                    >
                      {t('extracted.domains.domainCrawlersPanel.view_dcc839a4')}
                    </Link>
                    {' | '}
                    <Link
                      prefetch={false}
                      href={createCrawlerPathname(crawler, '/edit')}
                      className='text-primary hover:text-primary/80'
                      // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
                      data-pw={`domain-crawler-edit-${crawler.id}`}
                    >
                      {t('extracted.domains.domainCrawlersPanel.edit_464c4ffd')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
