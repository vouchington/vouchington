export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { NotificationSettingsForm } from '@/components/my/notification-settings-form'
import { SettingsPageHeader } from '@/components/my/settings-page-header'
import { requireCurrentUser } from '@/lib/auth/require-current-user'

export const metadata: Metadata = createNoIndexMetadata('Notification Settings')

export default async function NotificationSettingsPage() {
  const currentUser = await requireCurrentUser()
  return (
    <div className='space-y-6'>
      <SettingsPageHeader
        title='Notifications'
        description='Manage email notification preferences'
      />
      <NotificationSettingsForm
        initialSettings={{
          engagement_emails_enabled: currentUser.engagement_emails_enabled ?? true,
          news_digest_frequency: currentUser.news_digest_frequency ?? 'weekly',
          moderation_emails_enabled: currentUser.moderation_emails_enabled ?? true,
          community_digest_frequency: currentUser.community_digest_frequency ?? 'weekly',
          moderation_email_cadence: currentUser.moderation_email_cadence ?? 'daily',
          moderation_email_days_of_week: currentUser.moderation_email_days_of_week ?? [
            1, 2, 3, 4, 5,
          ],
          moderation_email_time_of_day: currentUser.moderation_email_time_of_day ?? '09:00',
          moderation_email_timezone: currentUser.moderation_email_timezone ?? 'America/Los_Angeles',
        }}
      />
    </div>
  )
}
