import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { sanitizeLoginNext } from '@/lib/auth/login-url'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getMyNotificationRedirectTarget } from '@/lib/api/server/my'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Notification Redirect')

function getSafeRedirectTarget(targetUrl: string): string {
  if (targetUrl.startsWith('/')) return sanitizeLoginNext(targetUrl)

  try {
    const url = new URL(targetUrl)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '/'
  } catch {
    return '/'
  }
}

export default async function NotificationRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations()
  const params = await searchParams
  const notificationId = typeof params.notification_id === 'string' ? params.notification_id : null
  if (!notificationId) redirect('/')

  let redirectTarget = '/'
  try {
    const response = await getMyNotificationRedirectTarget(notificationId)
    redirectTarget = getSafeRedirectTarget(response.target_url)
  } catch {
    redirectTarget = '/'
  }
  redirect(redirectTarget)

  return (
    <div hidden>
      <h1 className='sr-only'>
        {t('extracted.notificationRedirect.page.notificationRedirect_85e37458')}
      </h1>
    </div>
  )
}
