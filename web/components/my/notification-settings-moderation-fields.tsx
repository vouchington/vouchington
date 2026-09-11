import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  NotificationSettingsField,
  NotificationSettingsState,
  UpdateNotificationSetting,
} from './notification-settings-types'
import { DaysField } from './notification-settings-days-field'

export function ModerationSchedule({
  pending,
  settings,
  timezoneOptions,
  setCurrentSettings,
  markNotificationSettingDirty,
  updateNotificationSetting,
  onDayToggle,
}: {
  pending: Set<NotificationSettingsField>
  settings: NotificationSettingsState
  timezoneOptions: string[]
  setCurrentSettings: (
    updater: (current: NotificationSettingsState) => NotificationSettingsState,
  ) => void
  markNotificationSettingDirty: (field: NotificationSettingsField) => void
  updateNotificationSetting: UpdateNotificationSetting
  onDayToggle: (day: number, checked: boolean) => void
}) {
  return (
    <>
      <div className='grid gap-4 md:grid-cols-3'>
        <CadenceField
          disabled={pending.has('moderation_email_cadence')}
          value={settings.moderation_email_cadence}
          onChange={value => {
            void updateNotificationSetting('moderation_email_cadence', value)
          }}
        />
        <TimeField
          disabled={pending.has('moderation_email_time_of_day')}
          value={settings.moderation_email_time_of_day}
          setCurrentSettings={setCurrentSettings}
          markNotificationSettingDirty={markNotificationSettingDirty}
          onBlur={value => {
            void updateNotificationSetting('moderation_email_time_of_day', value, false)
          }}
        />
        <TimezoneField
          disabled={pending.has('moderation_email_timezone')}
          timezoneOptions={timezoneOptions}
          value={settings.moderation_email_timezone}
          onChange={value => {
            void updateNotificationSetting('moderation_email_timezone', value)
          }}
        />
      </div>
      {settings.moderation_email_cadence === 'selected_days' && (
        <DaysField
          disabled={pending.has('moderation_email_days_of_week')}
          selectedDays={settings.moderation_email_days_of_week}
          onDayToggle={onDayToggle}
        />
      )}
    </>
  )
}

function CadenceField({
  disabled,
  value,
  onChange,
}: {
  disabled: boolean
  value: NotificationSettingsState['moderation_email_cadence']
  onChange: (value: NotificationSettingsState['moderation_email_cadence']) => void
}) {
  return (
    <div className='space-y-2'>
      <Label htmlFor='moderation_email_cadence'>Cadence</Label>
      <Select
        value={value}
        onValueChange={next => onChange(next as typeof value)}
        disabled={disabled}
      >
        <SelectTrigger
          id='moderation_email_cadence'
          data-pw='moderation-email-cadence-select'
        >
          <SelectValue placeholder='Cadence' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='daily'>Daily</SelectItem>
          <SelectItem value='selected_days'>Selected days</SelectItem>
          <SelectItem value='weekly'>Weekly</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

function TimeField({
  disabled,
  value,
  setCurrentSettings,
  markNotificationSettingDirty,
  onBlur,
}: {
  disabled: boolean
  value: string
  setCurrentSettings: (
    updater: (current: NotificationSettingsState) => NotificationSettingsState,
  ) => void
  markNotificationSettingDirty: (field: NotificationSettingsField) => void
  onBlur: (value: string) => void
}) {
  return (
    <div className='space-y-2'>
      <Label htmlFor='moderation_email_time_of_day'>Time</Label>
      <Input
        id='moderation_email_time_of_day'
        type='time'
        value={value}
        disabled={disabled}
        data-pw='moderation-email-time-input'
        onChange={event => {
          markNotificationSettingDirty('moderation_email_time_of_day')
          setCurrentSettings(current => ({
            ...current,
            moderation_email_time_of_day: event.target.value,
          }))
        }}
        onBlur={event => onBlur(event.currentTarget.value)}
      />
    </div>
  )
}

function TimezoneField({
  disabled,
  timezoneOptions,
  value,
  onChange,
}: {
  disabled: boolean
  timezoneOptions: string[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className='space-y-2'>
      <Label htmlFor='moderation_email_timezone'>Timezone</Label>
      <Select
        value={value}
        onValueChange={onChange}
        disabled={disabled}
      >
        <SelectTrigger
          id='moderation_email_timezone'
          data-pw='moderation-email-timezone-select'
        >
          <SelectValue placeholder='Timezone' />
        </SelectTrigger>
        <SelectContent>
          {timezoneOptions.map(timeZone => (
            <SelectItem
              key={timeZone}
              value={timeZone}
            >
              {timeZone}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
