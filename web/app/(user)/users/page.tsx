import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { ClientSearchForm } from '@/components/shared/client-search-form'
import { PaginatedUserSearchResults } from '@/components/users/paginated-user-search-results'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { getUsersSearchResults } from '@/lib/api/server'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Users')

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function UsersPage({ searchParams }: PageProps) {
  const t = await getTranslations()
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')

  const params = await searchParams
  const query = typeof params.q === 'string' ? params.q.trim() : ''
  const data = query ? await getUsersSearchResults({ q: query, limit: 25 }) : null
  const isAdmin = currentUser.roles.includes('administrator')

  const breadcrumbItems = buildBreadcrumbsForPath('/users', {
    isAuthenticated: !!currentUser,
    userRoles: currentUser?.roles ?? [],
    tail: [{ name: 'Users', path: '/users' }],
  })

  return (
    <>
      <Breadcrumbs items={breadcrumbItems} />
      <div className='mt-4 flex flex-col gap-6'>
        <PageHeader
          title={t('extracted.users.page.users_6b0cc904')}
          description={t('extracted.users.page.searchForUserProfiles_3c7a5e91')}
        />
        <ClientSearchForm
          searchParamName='q'
          defaultValue={query}
          placeholder={
            isAdmin
              ? t('extracted.users.page.searchUsernameEmailOrId_1d5fb7de')
              : t('extracted.users.page.searchUsername_901eba28')
          }
          label={t('extracted.users.page.searchUsers_8b4f2e63')}
          className='max-w-2xl'
          inputClassName='min-w-0'
        />
        {query && data ? (
          <PaginatedUserSearchResults
            initialData={data}
            query={query}
            emptyTitle={t('extracted.users.page.noUsersFound_1e9a4c72')}
            emptyDescription={t('extracted.users.page.tryAnotherUsername_5f3b8d10')}
            showAdminAffordances={isAdmin}
            currentUserId={currentUser.id}
          />
        ) : (
          <EmptyState
            title={t('extracted.users.page.searchForUsers_90b650de')}
            description={t('extracted.users.page.enterAUsernameToFind_7a2c9e48')}
          />
        )}
      </div>
    </>
  )
}
