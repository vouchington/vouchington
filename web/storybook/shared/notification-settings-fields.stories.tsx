import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { DaysField } from '@/components/my/notification-settings-days-field'
import {
  DigestFrequencyField,
  EngagementEmailsSwitchRow,
  ModerationEmailsSwitchRow,
} from '@/components/my/notification-settings-fields'
import { ModerationSchedule } from '@/components/my/notification-settings-moderation-fields'
import type {
  NotificationSettingsState,
  UpdateNotificationSetting,
} from '@/components/my/notification-settings-types'

const settings: NotificationSettingsState = {
  engagement_emails_enabled: true,
  news_digest_frequency: 'weekly',
  moderation_emails_enabled: true,
  community_digest_frequency: 'daily',
  moderation_email_cadence: 'selected_days',
  moderation_email_days_of_week: [1, 3, 5],
  moderation_email_time_of_day: '08:30',
  moderation_email_timezone: 'America/Los_Angeles',
}

const updateNotificationSetting: UpdateNotificationSetting = async () => true
const setCurrentSettings = () => undefined
const markNotificationSettingDirty = () => undefined
const toggleDay = () => undefined

const meta = {
  title: 'Shared/NotificationSettingsFields',
  parameters: { layout: 'padded' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const DigestFrequency: Story = {
  render: () => (
    <div className='max-w-sm'>
      <DigestFrequencyField
        id='news_digest_frequency'
        label='News digest'
        value='weekly'
        disabled={false}
        onChange={() => undefined}
      />
    </div>
  ),
}

export const EngagementEmails: Story = {
  render: () => (
    <EngagementEmailsSwitchRow
      checked
      disabled={false}
      onCheckedChange={() => undefined}
    />
  ),
}

export const ModerationEmails: Story = {
  render: () => (
    <ModerationEmailsSwitchRow
      checked
      disabled={false}
      onCheckedChange={() => undefined}
    />
  ),
}

export const ModerationScheduleFields: Story = {
  render: () => (
    <ModerationSchedule
      pending={new Set()}
      settings={settings}
      timezoneOptions={['America/Los_Angeles', 'UTC']}
      setCurrentSettings={setCurrentSettings}
      markNotificationSettingDirty={markNotificationSettingDirty}
      updateNotificationSetting={updateNotificationSetting}
      onDayToggle={toggleDay}
    />
  ),
}

export const SelectedDays: Story = {
  render: () => (
    <DaysField
      disabled={false}
      selectedDays={[1, 3, 5]}
      onDayToggle={toggleDay}
    />
  ),
}
