import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getMyNotifications, getMyWebPushSubscriptions } from '@/lib/api/server'
import { NotificationsPage } from '@/components/notifications/notifications-page'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Notifications')

export default async function MyNotificationsPage() {
  const [notifications, subscriptions, currentUser] = await Promise.all([
    getMyNotifications(),
    getMyWebPushSubscriptions(),
    getCurrentUser(),
  ])
  const breadcrumbs = buildBreadcrumbsForPath('/my/notifications', {
    isAuthenticated: !!currentUser,
    tail: [{ name: 'Notifications', path: '/my/notifications' }],
  })

  return (
    <>
      <Breadcrumbs items={breadcrumbs} />
      <NotificationsPage
        initialNotifications={notifications}
        initialSubscriptions={subscriptions}
      />
    </>
  )
}
