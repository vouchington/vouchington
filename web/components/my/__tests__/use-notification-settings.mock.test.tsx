import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotificationSettings } from '../use-notification-settings'
import {
  getMyEmailPreferences,
  updateMyEmailPreferences,
  type EmailPreferences,
} from '@/lib/api/client/email-preferences'

const preferences: EmailPreferences = {
  engagement_emails_enabled: true,
  news_digest_frequency: 'weekly',
  moderation_emails_enabled: true,
  community_digest_frequency: 'weekly',
  moderation_email_cadence: 'daily',
  moderation_email_days_of_week: [1, 2, 3, 4, 5],
  moderation_email_time_of_day: '09:00',
  moderation_email_timezone: null,
}

const { mockOnError, mockOnSuccess } = vi.hoisted(() => ({
  mockOnError: vi.fn<VitestLooseMock>(),
  mockOnSuccess: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/api/client/email-preferences'), () => ({
  getMyEmailPreferences: vi.fn<VitestLooseMock>(),
  updateMyEmailPreferences: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/on-error'), () => ({ default: mockOnError, onSuccess: mockOnSuccess }))
vi.mock(import('@/lib/i18n/use-translations'), () => ({
  useTranslations: () => (key: string) => key,
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('useNotificationSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retries automatic timezone initialization after its PATCH fails', async () => {
    const dateTimeFormatSpy = vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
      format: () => '1/1/2026',
      resolvedOptions: () => ({ timeZone: 'America/Los_Angeles' }),
    } as Intl.DateTimeFormat)
    vi.mocked(getMyEmailPreferences).mockResolvedValue({ email_preferences: preferences })
    vi.mocked(updateMyEmailPreferences)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        email_preferences: { ...preferences, moderation_email_timezone: 'America/Los_Angeles' },
      })
    const { result } = renderHook(() =>
      useNotificationSettings({ ...preferences, moderation_email_timezone: 'America/Los_Angeles' }),
    )

    await waitFor(() =>
      expect(updateMyEmailPreferences).toHaveBeenCalledWith({
        moderation_email_timezone: 'America/Los_Angeles',
      }),
    )
    await waitFor(() => expect(result.current.pending).not.toContain('moderation_email_timezone'))

    await act(async () => {
      await result.current.loadSettings()
    })

    await waitFor(() => expect(updateMyEmailPreferences).toHaveBeenCalledTimes(2))
    dateTimeFormatSpy.mockRestore()
  })

  it('keeps a successful pending update when a retry load resolves its older value', async () => {
    const patch = deferred<{ email_preferences: EmailPreferences }>()
    const retryLoad = deferred<{ email_preferences: EmailPreferences }>()
    const initialSettings = { ...preferences, moderation_email_timezone: 'America/Los_Angeles' }
    vi.mocked(getMyEmailPreferences)
      .mockResolvedValueOnce({ email_preferences: initialSettings })
      .mockReturnValueOnce(retryLoad.promise)
    vi.mocked(updateMyEmailPreferences).mockReturnValueOnce(patch.promise)
    const { result } = renderHook(() => useNotificationSettings(initialSettings))

    await waitFor(() => expect(getMyEmailPreferences).toHaveBeenCalledTimes(1))
    let update: Promise<boolean>
    act(() => {
      update = result.current.updateNotificationSetting('engagement_emails_enabled', false)
    })
    await waitFor(() =>
      expect(updateMyEmailPreferences).toHaveBeenCalledWith({ engagement_emails_enabled: false }),
    )
    const load = result.current.loadSettings()
    await waitFor(() => expect(getMyEmailPreferences).toHaveBeenCalledTimes(2))

    patch.resolve({ email_preferences: { ...initialSettings, engagement_emails_enabled: false } })
    await update!
    retryLoad.resolve({ email_preferences: initialSettings })
    await load

    expect(result.current.settings.engagement_emails_enabled).toBe(false)
    await result.current.updateNotificationSetting('engagement_emails_enabled', false)
    expect(updateMyEmailPreferences).toHaveBeenCalledTimes(1)
  })

  it('does not auto-resolve a timezone while an explicit update was pending at retry start', async () => {
    const patch = deferred<{ email_preferences: EmailPreferences }>()
    const retryLoad = deferred<{ email_preferences: EmailPreferences }>()
    const initialSettings = { ...preferences, moderation_email_timezone: 'America/Los_Angeles' }
    const dateTimeFormatSpy = vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
      format: () => '1/1/2026',
      resolvedOptions: () => ({ timeZone: 'America/Los_Angeles' }),
    } as Intl.DateTimeFormat)
    vi.mocked(getMyEmailPreferences)
      .mockResolvedValueOnce({ email_preferences: initialSettings })
      .mockReturnValueOnce(retryLoad.promise)
    vi.mocked(updateMyEmailPreferences).mockReturnValueOnce(patch.promise)
    const { result } = renderHook(() => useNotificationSettings(initialSettings))

    await waitFor(() => expect(getMyEmailPreferences).toHaveBeenCalledTimes(1))
    let update: Promise<boolean>
    act(() => {
      update = result.current.updateNotificationSetting(
        'moderation_email_timezone',
        'America/New_York',
      )
    })
    await waitFor(() =>
      expect(updateMyEmailPreferences).toHaveBeenCalledWith({
        moderation_email_timezone: 'America/New_York',
      }),
    )
    const load = result.current.loadSettings()
    await waitFor(() => expect(getMyEmailPreferences).toHaveBeenCalledTimes(2))

    patch.resolve({
      email_preferences: { ...initialSettings, moderation_email_timezone: 'America/New_York' },
    })
    await update!
    retryLoad.resolve({ email_preferences: preferences })
    await load

    expect(result.current.settings.moderation_email_timezone).toBe('America/New_York')
    expect(updateMyEmailPreferences).toHaveBeenCalledTimes(1)
    dateTimeFormatSpy.mockRestore()
  })
})
