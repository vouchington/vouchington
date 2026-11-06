import type { Metadata } from 'next'
import Link from 'next/link'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminTableShell } from '@/components/admin/admin-table-shell'
import { ClientSearchForm } from '@/components/shared/client-search-form'
import { PageWithAside } from '@/components/page-with-aside'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getTopicAliasesSearch } from '@/lib/api/server'
import { topicManagementHref } from '@/lib/links/entity-href'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Topic Aliases | Admin')

export default async function TopicAliasesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const t = await getTranslations()
  await requireAdmin()
  const params = await searchParams

  let results: {
    topic_id: string
    alias: string
    topic: { id: string; name: string; slug: string; topic_type: string }
  }[] = []

  if (params.q) {
    const data = await getTopicAliasesSearch<{ results: typeof results }>({
      q: params.q,
      limit: '24',
    })
    results = data.results
  }

  const breadcrumbItems = buildBreadcrumbsForPath('/topics/aliases', {
    isAuthenticated: true,
    userRoles: ['administrator'],
    tail: [{ name: 'Aliases', path: '/topics/aliases' }],
  })

  return (
    <PageWithAside showFooter={false}>
      <Breadcrumbs items={breadcrumbItems} />
      <AdminPageHeader
        dataPw='topic-aliases-search-heading'
        title={t('extracted.aliases.page.topicAliases_79589f83')}
        description={t('extracted.aliases.page.searchTopicNamesSlugsAndAliases_3d7a9e64')}
      />

      <div className='my-6'>
        <ClientSearchForm
          searchParamName='q'
          defaultValue={params.q}
          placeholder={t('extracted.aliases.page.searchAliases_bc0098f3')}
          label={t('extracted.aliases.page.searchAliasesLabel_8f2c6b93')}
        />
      </div>

      {params.q && (
        <AdminTableShell aria-label={t('extracted.aliases.page.topicAliases_79589f83')}>
          <table className='min-w-full divide-y divide-border'>
            <thead className='bg-muted/50'>
              <tr>
                <th
                  scope='col'
                  className='px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
                >
                  {t('extracted.aliases.page.topicName_afd56fda')}
                </th>
                <th
                  scope='col'
                  className='px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
                >
                  {t('extracted.aliases.page.alias_b19e02e9')}
                </th>
                <th
                  scope='col'
                  className='px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
                >
                  {t('extracted.aliases.page.actions_ff8059dc')}
                </th>
              </tr>
            </thead>
            <tbody className='divide-y divide-border bg-card'>
              {results.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className='px-6 py-4 text-sm text-muted-foreground'
                  >
                    {t('extracted.aliases.page.noAliasesFound_713e388a')}
                  </td>
                </tr>
              ) : (
                results.map(result => (
                  <tr key={`${result.topic_id}-${result.alias}`}>
                    <td className='px-6 py-4 text-sm text-foreground'>{result.topic.name}</td>
                    <td className='px-6 py-4 text-sm text-muted-foreground'>{result.alias}</td>
                    <td className='whitespace-nowrap px-6 py-4 text-sm text-muted-foreground'>
                      <Link
                        prefetch={false}
                        href={topicManagementHref(result.topic, 'settings/aliases')}
                        className='text-primary hover:text-primary/80'
                        // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
                        data-pw={`alias-search-edit-link-${result.alias}`}
                      >
                        {t('extracted.aliases.page.editAliases_c526d9ba')}
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </AdminTableShell>
      )}
    </PageWithAside>
  )
}
