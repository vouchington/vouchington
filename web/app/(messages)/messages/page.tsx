import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { PageHeader } from '@/components/shared/page-header'
import { PageWithAside } from '@/components/page-with-aside'
import { Button } from '@/components/ui/button'
import { getMyMessages } from '@/lib/api/server/messages'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { MessagesInboxClient } from './messages-inbox-client'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Messages')

export default async function MessagesPage() {
  const t = await getTranslations()
  const currentUser = await getCurrentUser()
  let initialConversations: Awaited<ReturnType<typeof getMyMessages>>['results'] = []
  let initialHasMore = false
  let initialEndCursor: string | null = null
  try {
    const response = await getMyMessages()
    initialConversations = response.results
    initialHasMore = response.page_info.has_next_page
    initialEndCursor = response.page_info.end_cursor
  } catch {
    // Gracefully degrade — user can still see the empty state
  }

  const breadcrumbs = buildBreadcrumbsForPath('/messages', {
    isAuthenticated: !!currentUser,
    tail: [{ name: 'Messages', path: '/messages' }],
  })

  return (
    <PageWithAside showFooter={false}>
      <div
        className='space-y-4'
        data-pw='messages-inbox'
      >
        <Breadcrumbs items={breadcrumbs} />
        <div className='flex items-start justify-between'>
          <PageHeader
            title={t('extracted.messages.page.messages_04d7b483')}
            description={t('extracted.messages.page.yourDirectMessageConversations_4d5e6f7a')}
          />
          <Button
            asChild
            variant='outline'
            size='sm'
          >
            <Link
              href='/messages/new'
              data-pw='new-message-button'
            >
              {t('extracted.messages.page.newMessage_78f5975a')}
            </Link>
          </Button>
        </div>
        <MessagesInboxClient
          initialConversations={initialConversations}
          initialHasMore={initialHasMore}
          initialEndCursor={initialEndCursor}
        />
      </div>
    </PageWithAside>
  )
}
