import { redirect } from 'next/navigation'
import { ClientSearchForm } from '@/components/shared/client-search-form'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { UrlListPage } from '@/components/urls/url-list-page'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getUrls } from '@/lib/api/server/urls'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { PageWithAside } from '@/components/page-with-aside'
import { PageHeader } from '@/components/shared/page-header'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'

export const metadata = createNoIndexMetadata('URLs')

export default async function UrlsPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string; hostnameId?: string }>
}) {
  const t = await getTranslations()
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')

  const params = await searchParams
  const data = await getUrls({
    searchParams: {
      query: params.query,
      hostnameId: params.hostnameId,
      limit: '50',
    },
  })

  const breadcrumbItems = buildBreadcrumbsForPath('/urls', {
    isAuthenticated: true,
    userRoles: ['administrator'],
    tail: [{ name: 'URLs', path: '/urls' }],
  })

  return (
    <PageWithAside showFooter={false}>
      <div className='space-y-4'>
        <Breadcrumbs items={breadcrumbItems} />
        <PageHeader title={t('extracted.urls.page.urls_1240054e')} />

        <ClientSearchForm
          searchParamName='query'
          defaultValue={params.query}
          placeholder={t('extracted.urls.page.searchUrls_dfd3d0bb')}
          label={t('extracted.urls.page.searchUrlsLabel_4b8e1c72')}
        />

        <UrlListPage
          data={data}
          nextPageParams={{
            query: params.query,
            hostnameId: params.hostnameId,
            limit: 50,
          }}
        />
      </div>
    </PageWithAside>
  )
}
