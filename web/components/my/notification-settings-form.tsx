'use client'

import {
  DigestFrequencyField,
  EngagementEmailsSwitchRow,
  ModerationEmailsSwitchRow,
} from './notification-settings-fields'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'
import { ModerationSchedule } from './notification-settings-moderation-fields'
import { useNotificationSettings } from './use-notification-settings'
import type { NotificationSettingsState } from './notification-settings-types'

export type { NotificationSettingsState } from './notification-settings-types'

export function NotificationSettingsForm({
  initialSettings,
}: {
  initialSettings: NotificationSettingsState
}) {
  const t = useTranslations()
  const {
    pending,
    settings,
    loadError,
    loadingSettings,
    loadSettings,
    setCurrentSettings,
    markNotificationSettingDirty,
    updateNotificationSetting,
    handleDayToggle,
    timezoneOptions,
  } = useNotificationSettings(initialSettings)

  return (
    <div className='space-y-8'>
      {loadError ? (
        <Alert variant='destructive'>
          <AlertDescription className='flex flex-wrap items-center justify-between gap-3'>
            <span>{t('settings.notificationSettings.loadError')}</span>
            <Button
              variant='outline'
              size='touchSm'
              loading={loadingSettings}
              disabled={loadingSettings}
              onClick={() => {
                void loadSettings()
              }}
            >
              {t('settings.notificationSettings.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <section className='space-y-4'>
        <h2 className='text-lg font-semibold'>Engagement Emails</h2>
        <EngagementEmailsSwitchRow
          checked={settings.engagement_emails_enabled}
          disabled={pending.has('engagement_emails_enabled')}
          onCheckedChange={enabled => {
            void updateNotificationSetting('engagement_emails_enabled', enabled)
          }}
        />
      </section>

      <section className='space-y-4'>
        <h2 className='text-lg font-semibold'>Digests</h2>
        <div className='grid gap-4 md:grid-cols-2'>
          <DigestFrequencyField
            id='news_digest_frequency'
            label='News digest'
            value={settings.news_digest_frequency}
            disabled={pending.has('news_digest_frequency')}
            onChange={value => {
              void updateNotificationSetting('news_digest_frequency', value)
            }}
          />
          <DigestFrequencyField
            id='community_digest_frequency'
            label='Community digest'
            value={settings.community_digest_frequency}
            disabled={pending.has('community_digest_frequency')}
            onChange={value => {
              void updateNotificationSetting('community_digest_frequency', value)
            }}
          />
        </div>
      </section>

      <section className='space-y-4'>
        <h2 className='text-lg font-semibold'>Moderation Emails</h2>
        <ModerationEmailsSwitchRow
          checked={settings.moderation_emails_enabled}
          disabled={pending.has('moderation_emails_enabled')}
          onCheckedChange={enabled => {
            void updateNotificationSetting('moderation_emails_enabled', enabled)
          }}
        />
        {settings.moderation_emails_enabled && (
          <ModerationSchedule
            pending={pending}
            settings={settings}
            timezoneOptions={timezoneOptions}
            setCurrentSettings={setCurrentSettings}
            markNotificationSettingDirty={markNotificationSettingDirty}
            updateNotificationSetting={updateNotificationSetting}
            onDayToggle={handleDayToggle}
          />
        )}
      </section>
    </div>
  )
}
