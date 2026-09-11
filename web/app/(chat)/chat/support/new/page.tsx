import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { PageHeader } from '@/components/shared/page-header'
import { PageWithAside } from '@/components/page-with-aside'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { NewSupportThreadClient } from './new-support-thread-client'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('New Support Request')

interface PageProps {
  searchParams: Promise<{ conversation_id?: string }>
}

export default async function NewSupportThreadPage({ searchParams }: PageProps) {
  const t = await getTranslations()
  const params = await searchParams
  const conversationId = params.conversation_id ?? undefined

  const breadcrumbItems = buildBreadcrumbsForPath('/chat/support/new', {
    isAuthenticated: true,
    userRoles: [],
    tail: [
      { name: 'Support', path: '/chat/support' },
      { name: 'New Request', path: '/chat/support/new' },
    ],
  })

  return (
    <PageWithAside showFooter={false}>
      <div className='space-y-4'>
        <Breadcrumbs items={breadcrumbItems} />
        <PageHeader
          title={t('extracted.new.page.submitASupportRequest_c6bc427b')}
          description={t('extracted.new.page.describeYourIssueAndOur_9f2c81ae')}
        />
        <NewSupportThreadClient conversationId={conversationId} />
      </div>
    </PageWithAside>
  )
}
