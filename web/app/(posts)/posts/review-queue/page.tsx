import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { getAdminReviewQueue } from '@/lib/api/server'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { AdminReviewQueueClient } from './review-queue-client'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Review Queue | Admin')

export default async function AdminReviewQueuePage() {
  const initialData = await getAdminReviewQueue({ limit: 30 })

  const breadcrumbItems = buildBreadcrumbsForPath('/posts/review-queue', {
    isAuthenticated: true,
    userRoles: ['administrator'],
    tail: [{ name: 'Review Queue', path: '/posts/review-queue' }],
  })

  return (
    <>
      <Breadcrumbs items={breadcrumbItems} />
      <AdminReviewQueueClient initialData={initialData} />
    </>
  )
}
