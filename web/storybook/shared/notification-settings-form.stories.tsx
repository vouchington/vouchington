import type { ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { NotificationSettingsForm } from '@/components/my/notification-settings-form'
import type { EmailPreferences } from '@/lib/api/client/email-preferences'
import {
  clearNotificationSettingsFixture,
  setNotificationSettingsFixture,
} from '../mocks/client-api-instance'
import { storyCurrentUser } from '../entities/entity-fixtures'

const notificationSettingsUser = {
  ...storyCurrentUser,
  engagement_emails_enabled: true,
  moderation_emails_enabled: true,
  moderation_email_cadence: 'selected_days',
  moderation_email_days_of_week: [1, 3, 5],
  moderation_email_time_of_day: '08:30',
  moderation_email_timezone: 'America/Los_Angeles',
} satisfies typeof storyCurrentUser

const meta = {
  title: 'Shared/NotificationSettingsForm',
  parameters: { auth: { currentUser: notificationSettingsUser } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function Frame({ children }: { children: ReactNode }) {
  return (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto max-w-3xl space-y-6'>{children}</div>
    </main>
  )
}

function notificationSettingsFixture(preferences: EmailPreferences) {
  return () => {
    setNotificationSettingsFixture(preferences)
    return clearNotificationSettingsFixture
  }
}

const defaultPreferences = {
  engagement_emails_enabled: true,
  news_digest_frequency: 'weekly',
  moderation_emails_enabled: true,
  community_digest_frequency: 'weekly',
  moderation_email_cadence: 'selected_days',
  moderation_email_days_of_week: [1, 3, 5],
  moderation_email_time_of_day: '08:30',
  moderation_email_timezone: 'America/Los_Angeles',
} satisfies EmailPreferences

const moderationDisabledPreferences = {
  ...defaultPreferences,
  moderation_emails_enabled: false,
} satisfies EmailPreferences

export const Default: Story = {
  beforeEach: notificationSettingsFixture(defaultPreferences),
  render: () => (
    <Frame>
      <div>
        <h1 className='text-2xl font-bold'>Notifications</h1>
        <p className='text-sm text-muted-foreground'>
          Manage email recommendations and community moderation summaries.
        </p>
      </div>
      <NotificationSettingsForm initialSettings={defaultPreferences} />
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.findByLabelText('Timezone')).resolves.toHaveTextContent(
      'America/Los_Angeles',
    )
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument()
  },
}

export const ModerationDisabled: Story = {
  beforeEach: notificationSettingsFixture(moderationDisabledPreferences),
  render: () => (
    <Frame>
      <NotificationSettingsForm initialSettings={moderationDisabledPreferences} />
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.findByLabelText('Community moderation summary')).resolves.toBeVisible()
    await expect(canvas.queryByLabelText('Cadence')).not.toBeInTheDocument()
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument()
  },
}
