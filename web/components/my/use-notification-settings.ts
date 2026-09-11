'use client'

import { useEffect, useEffectEvent, useRef, useState } from 'react'
import {
  getMyEmailPreferences,
  updateMyEmailPreferences,
  type EmailPreferenceUpdate,
} from '@/lib/api/client/email-preferences'
import onError, { onSuccess } from '@/lib/on-error'
import { useTranslations } from '@/lib/i18n/use-translations'
import type {
  NotificationSettingsField,
  NotificationSettingsState,
  UpdateNotificationSetting,
} from './notification-settings-types'
import { autoResolveModerationTimezone } from './notification-settings-timezone-initialization'
import {
  getTimeZoneOptions,
  hasSavedTimeZone,
  settingsValueEquals,
  toNotificationSettings,
} from './notification-settings-utils'

export function useNotificationSettings(initialSettings: NotificationSettingsState) {
  const t = useTranslations()
  const [pending, setPending] = useState<Set<NotificationSettingsField>>(new Set())
  const [settings, setSettings] = useState<NotificationSettingsState>(initialSettings)
  const [loadError, setLoadError] = useState(false)
  const [loadingSettings, setLoadingSettings] = useState(false)
  const settingsRef = useRef<NotificationSettingsState>(initialSettings)
  const savedSettings = useRef<NotificationSettingsState>(initialSettings)
  const pendingFields = useRef<Set<NotificationSettingsField>>(new Set())
  const generations = useRef<Record<NotificationSettingsField, number>>(
    Object.fromEntries(Object.keys(initialSettings).map(field => [field, 0])) as Record<
      NotificationSettingsField,
      number
    >,
  )
  const dirtyDraftFields = useRef<Set<NotificationSettingsField>>(new Set())
  const autoResolvedModerationTimezone = useRef(false)
  const autoResolvingModerationTimezone = useRef(false)
  const loadGeneration = useRef(0)
  function setCurrentSettings(
    updater: (current: NotificationSettingsState) => NotificationSettingsState,
  ) {
    setSettings(current => {
      const next = updater(current)
      settingsRef.current = next
      return next
    })
  }
  function markNotificationSettingDirty(field: NotificationSettingsField) {
    dirtyDraftFields.current.add(field)
  }
  const updateNotificationSetting: UpdateNotificationSetting = async (
    field,
    value,
    optimistic = true,
    allowSavedDuplicate = false,
  ) => {
    if (pendingFields.current.has(field)) {
      return false
    }
    if (!allowSavedDuplicate && settingsValueEquals(savedSettings.current[field], value)) {
      dirtyDraftFields.current.delete(field)
      return false
    }

    const generation = generations.current[field] + 1
    generations.current[field] = generation
    dirtyDraftFields.current.delete(field)
    const previousValue = savedSettings.current[field]
    pendingFields.current.add(field)
    setPending(current => new Set(current).add(field))
    if (optimistic) setCurrentSettings(current => ({ ...current, [field]: value }))

    try {
      const response = await updateMyEmailPreferences({
        [field]: value,
      } as unknown as EmailPreferenceUpdate)
      if (generations.current[field] !== generation) return false

      const serverValue = toNotificationSettings(response.email_preferences)[field]
      savedSettings.current = { ...savedSettings.current, [field]: serverValue }
      setCurrentSettings(current => ({ ...current, [field]: serverValue }))
      onSuccess('Notification setting updated')
      return true
    } catch (error) {
      if (generations.current[field] !== generation) return false

      setCurrentSettings(current => ({ ...current, [field]: previousValue }))
      onError(error, {
        fallback: 'Failed to update notification setting',
        tags: { form: 'my-notification-settings', field },
      })
      return false
    } finally {
      if (generations.current[field] === generation) {
        pendingFields.current.delete(field)
        setPending(current => {
          const next = new Set(current)
          next.delete(field)
          return next
        })
      }
    }
  }
  const resolveModerationTimezone = () => {
    autoResolveModerationTimezone({
      resolved: autoResolvedModerationTimezone,
      resolving: autoResolvingModerationTimezone,
      updateNotificationSetting,
    })
  }

  async function loadSettings() {
    const generation = loadGeneration.current + 1
    loadGeneration.current = generation
    const fieldGenerations = { ...generations.current }
    const fieldsPendingAtLoad = new Set(pendingFields.current)
    setLoadingSettings(true)
    try {
      const response = await getMyEmailPreferences()
      if (loadGeneration.current !== generation) return
      const loaded = toNotificationSettings(response.email_preferences)
      const [savedFieldsToLoad, renderedFieldsToLoad] = (
        Object.keys(loaded) as NotificationSettingsField[]
      ).reduce<[Partial<NotificationSettingsState>, Partial<NotificationSettingsState>]>(
        ([saved, rendered], field) => {
          if (
            fieldsPendingAtLoad.has(field) ||
            generations.current[field] !== fieldGenerations[field]
          ) {
            return [saved, rendered]
          }
          copyLoadedField(saved, field, loaded)
          if (!dirtyDraftFields.current.has(field)) copyLoadedField(rendered, field, loaded)
          return [saved, rendered]
        },
        [{}, {}],
      )
      savedSettings.current = { ...savedSettings.current, ...savedFieldsToLoad }
      setCurrentSettings(current => ({ ...current, ...renderedFieldsToLoad }))
      setLoadError(false)

      if (
        hasSavedTimeZone(response.email_preferences.moderation_email_timezone) ||
        fieldsPendingAtLoad.has('moderation_email_timezone') ||
        generations.current.moderation_email_timezone !== fieldGenerations.moderation_email_timezone
      ) {
        return
      }
      resolveModerationTimezone()
    } catch (error) {
      if (loadGeneration.current !== generation) return
      setLoadError(true)
      onError(error, {
        fallback: t('settings.notificationSettings.loadErrorFallback'),
        tags: { form: 'my-notification-settings' },
      })
    } finally {
      if (loadGeneration.current === generation) setLoadingSettings(false)
    }
  }

  const loadSettingsFromEffect = useEffectEvent(loadSettings)

  useEffect(() => {
    void Promise.resolve().then(loadSettingsFromEffect)
  }, [])

  function handleDayToggle(day: number, checked: boolean) {
    const selectedDays = settingsRef.current.moderation_email_days_of_week
    if (!checked && selectedDays.length === 1 && selectedDays.includes(day)) return
    const nextDays = checked
      ? [...new Set([...selectedDays, day])].toSorted()
      : selectedDays.filter(value => value !== day)
    void updateNotificationSetting('moderation_email_days_of_week', nextDays)
  }

  return {
    pending,
    settings,
    loadError,
    loadingSettings,
    loadSettings,
    setCurrentSettings,
    markNotificationSettingDirty,
    updateNotificationSetting,
    handleDayToggle,
    timezoneOptions: getTimeZoneOptions(settings.moderation_email_timezone),
  }
}
function copyLoadedField<K extends NotificationSettingsField>(
  target: Partial<NotificationSettingsState>,
  field: K,
  source: NotificationSettingsState,
) {
  target[field] = source[field]
}
