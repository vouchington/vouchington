export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { CreateCommunityForm } from '@/components/communities/create-community-form'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { PageWithAside } from '@/components/page-with-aside'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { getTranslations } from '@/lib/i18n/get-translations'

export const metadata = createNoIndexMetadata('Create Community')

export default async function CreateCommunityPage() {
  const t = await getTranslations()
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    redirect('/login')
  }

  const breadcrumbItems = buildBreadcrumbsForPath('/communities/create', {
    isAuthenticated: !!currentUser,
    userRoles: currentUser?.roles ?? [],
    tail: [{ name: 'Create', path: '/communities/create' }],
  })

  return (
    <PageWithAside showFooter={false}>
      <div className='max-w-xl space-y-4'>
        <Breadcrumbs items={breadcrumbItems} />
        <div>
          <h1 className='text-2xl font-bold'>
            {t('extracted.create.page.createACommunity_95409fba')}
          </h1>
          <p className='text-sm text-muted-foreground'>
            {t('extracted.create.page.startANewCommunityAndInvite_3eecf1d4')}
          </p>
        </div>
        <CreateCommunityForm />
      </div>
    </PageWithAside>
  )
}
