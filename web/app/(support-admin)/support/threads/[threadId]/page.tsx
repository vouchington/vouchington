import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { getAdminSupportThread, getAdminSupportThreadMessages } from '@/lib/api/server'
import { SUPPORT_DETAIL_PAGE_SIZE } from '@/lib/api/support-detail-page-size'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { supportThreadHref } from '@/lib/links/entity-href'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { AdminSupportThreadDetailClient } from './admin-support-thread-detail-client'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Support Thread | Admin')

interface Props {
  params: Promise<{ threadId: string }>
}

export default async function AdminSupportThreadPage({ params }: Props) {
  const { threadId } = await params

  const [threadData, messagesData] = await Promise.all([
    getAdminSupportThread(threadId),
    getAdminSupportThreadMessages(threadId, { limit: SUPPORT_DETAIL_PAGE_SIZE }),
  ])

  if (!threadData) notFound()

  const breadcrumbItems = buildBreadcrumbsForPath(supportThreadHref(threadId), {
    isAuthenticated: true,
    userRoles: ['administrator'],
    tail: [
      { name: 'Support', path: '/support' },
      { name: threadData.thread.subject, path: supportThreadHref(threadId) },
    ],
  })

  return (
    <>
      <Breadcrumbs items={breadcrumbItems} />
      <AdminSupportThreadDetailClient
        thread={threadData.thread}
        initialMessagesData={
          messagesData ?? {
            results: [],
            page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
          }
        }
      />
    </>
  )
}
