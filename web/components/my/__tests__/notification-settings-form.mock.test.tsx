import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationSettingsForm } from '../notification-settings-form'
import {
  getMyEmailPreferences,
  updateMyEmailPreferences,
  type EmailPreferences,
} from '@/lib/api/client/email-preferences'

const defaultPreferences: EmailPreferences = {
  engagement_emails_enabled: true,
  news_digest_frequency: 'weekly',
  moderation_emails_enabled: true,
  community_digest_frequency: 'weekly',
  moderation_email_cadence: 'daily',
  moderation_email_days_of_week: [1, 2, 3, 4, 5],
  moderation_email_time_of_day: '09:00',
  moderation_email_timezone: 'America/Los_Angeles',
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

function renderForm({
  preferences = defaultPreferences,
}: {
  preferences?: EmailPreferences
} = {}) {
  return render(
    <NotificationSettingsForm
      initialSettings={{
        ...preferences,
        moderation_email_timezone: preferences.moderation_email_timezone ?? 'America/Los_Angeles',
      }}
    />,
  )
}

function response(preferences: EmailPreferences = defaultPreferences) {
  return { email_preferences: preferences }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function select(label: string, option: string) {
  fireEvent.click(screen.getByLabelText(label))
  fireEvent.click(await screen.findByRole('option', { name: option }))
}

describe('NotificationSettingsForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getMyEmailPreferences).mockResolvedValue(response())
    vi.mocked(updateMyEmailPreferences).mockImplementation(body =>
      Promise.resolve(response({ ...defaultPreferences, ...body })),
    )
  })

  it.each([
    [
      'engagement',
      () => fireEvent.click(screen.getByLabelText('Engagement emails')),
      { engagement_emails_enabled: false },
    ],
    ['news digest', () => select('News digest', 'Daily'), { news_digest_frequency: 'daily' }],
    [
      'moderation',
      () => fireEvent.click(screen.getByLabelText('Community moderation summary')),
      { moderation_emails_enabled: false },
    ],
    [
      'community digest',
      () => select('Community digest', 'Off'),
      { community_digest_frequency: 'none' },
    ],
    [
      'cadence',
      () => select('Cadence', 'Selected days'),
      { moderation_email_cadence: 'selected_days' },
    ],
    [
      'selected days',
      async () => {
        await select('Cadence', 'Selected days')
        await waitFor(() => expect(updateMyEmailPreferences).toHaveBeenCalledTimes(1))
        fireEvent.click(screen.getByLabelText('Mon'))
      },
      { moderation_email_days_of_week: [2, 3, 4, 5] },
    ],
    [
      'time',
      () => {
        const input = screen.getByLabelText('Time')
        fireEvent.change(input, { target: { value: '15:30' } })
        fireEvent.blur(input)
      },
      { moderation_email_time_of_day: '15:30' },
    ],
    [
      'timezone',
      () => select('Timezone', 'America/New_York'),
      { moderation_email_timezone: 'America/New_York' },
    ],
  ])('sends only the changed %s field', async (_field, action, payload) => {
    renderForm()

    await action()

    await waitFor(() => expect(updateMyEmailPreferences).toHaveBeenCalledWith(payload))
    const body = vi.mocked(updateMyEmailPreferences).mock.calls.at(-1)?.[0]
    expect(Object.keys(body ?? {})).toEqual(Object.keys(payload))
  })

  it('ignores duplicate requests and disables only the pending control', async () => {
    const request = deferred<ReturnType<typeof response>>()
    vi.mocked(updateMyEmailPreferences).mockReturnValueOnce(request.promise)
    renderForm()

    fireEvent.click(screen.getByLabelText('Engagement emails'))
    fireEvent.click(screen.getByLabelText('Engagement emails'))

    expect(updateMyEmailPreferences).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Engagement emails')).toBeDisabled()
    expect(screen.getByLabelText('News digest')).not.toBeDisabled()
    request.resolve(response({ ...defaultPreferences, engagement_emails_enabled: false }))
    await waitFor(() => expect(screen.getByLabelText('Engagement emails')).not.toBeDisabled())
  })

  it('allows requests for different fields concurrently', async () => {
    const engagement = deferred<ReturnType<typeof response>>()
    const news = deferred<ReturnType<typeof response>>()
    vi.mocked(updateMyEmailPreferences)
      .mockReturnValueOnce(engagement.promise)
      .mockReturnValueOnce(news.promise)
    renderForm()

    fireEvent.click(screen.getByLabelText('Engagement emails'))
    await select('News digest', 'Daily')

    expect(updateMyEmailPreferences).toHaveBeenNthCalledWith(1, {
      engagement_emails_enabled: false,
    })
    expect(updateMyEmailPreferences).toHaveBeenNthCalledWith(2, { news_digest_frequency: 'daily' })
    expect(screen.getByLabelText('Engagement emails')).toBeDisabled()
    expect(screen.getByLabelText('News digest')).toBeDisabled()
    news.resolve(response({ ...defaultPreferences, news_digest_frequency: 'daily' }))
    await waitFor(() => expect(screen.getByLabelText('News digest')).toHaveTextContent('Daily'))
    engagement.resolve(response({ ...defaultPreferences, engagement_emails_enabled: false }))

    await waitFor(() => expect(screen.getByLabelText('Engagement emails')).not.toBeChecked())
    expect(screen.getByLabelText('News digest')).toHaveTextContent('Daily')
  })

  it('does not let a late load overwrite a completed field update', async () => {
    const load = deferred<ReturnType<typeof response>>()
    vi.mocked(getMyEmailPreferences).mockReturnValueOnce(load.promise)
    renderForm()

    fireEvent.click(screen.getByLabelText('Engagement emails'))
    await waitFor(() =>
      expect(updateMyEmailPreferences).toHaveBeenCalledWith({ engagement_emails_enabled: false }),
    )
    await waitFor(() => expect(screen.getByLabelText('Engagement emails')).not.toBeChecked())
    load.resolve(response({ ...defaultPreferences, engagement_emails_enabled: true }))
    await waitFor(() => expect(screen.getByLabelText('Engagement emails')).not.toBeChecked())
  })

  it('rolls back only the failed field', async () => {
    vi.mocked(updateMyEmailPreferences)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(response({ ...defaultPreferences, news_digest_frequency: 'daily' }))
    renderForm()

    fireEvent.click(screen.getByLabelText('Engagement emails'))
    await select('News digest', 'Daily')

    await waitFor(() => expect(screen.getByLabelText('Engagement emails')).toBeChecked())
    expect(screen.getByLabelText('News digest')).toHaveTextContent('Daily')
    expect(mockOnError).toHaveBeenCalledWith(expect.any(Error), {
      fallback: 'Failed to update notification setting',
      tags: { form: 'my-notification-settings', field: 'engagement_emails_enabled' },
    })
  })

  it('commits the requested field from a normalized server response', async () => {
    vi.mocked(updateMyEmailPreferences).mockResolvedValueOnce(
      response({ ...defaultPreferences, moderation_email_time_of_day: '15:30:00' }),
    )
    renderForm()
    await waitFor(() => expect(getMyEmailPreferences).toHaveBeenCalled())
    const input = screen.getByLabelText('Time')
    fireEvent.change(input, { target: { value: '15:30' } })
    fireEvent.blur(input)

    await waitFor(() => expect(input).toHaveValue('15:30:00'))
  })

  it('persists one valid detected timezone, including Los Angeles, when it is unset', async () => {
    const dateTimeFormatSpy = vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
      format: () => '1/1/2026',
      resolvedOptions: () => ({ timeZone: 'America/Los_Angeles' }),
    } as Intl.DateTimeFormat)
    const preferences = { ...defaultPreferences, moderation_email_timezone: null }
    vi.mocked(getMyEmailPreferences).mockResolvedValueOnce(response(preferences))
    renderForm({ preferences })

    await waitFor(() =>
      expect(updateMyEmailPreferences).toHaveBeenCalledWith({
        moderation_email_timezone: 'America/Los_Angeles',
      }),
    )
    expect(updateMyEmailPreferences).toHaveBeenCalledTimes(1)
    dateTimeFormatSpy.mockRestore()
  })

  it('shows Los Angeles without writing when timezone detection is invalid', async () => {
    const dateTimeFormatSpy = vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
      resolvedOptions: () => ({ timeZone: 'not/a-timezone' }),
    } as Intl.DateTimeFormat)
    const preferences = { ...defaultPreferences, moderation_email_timezone: null }
    vi.mocked(getMyEmailPreferences).mockResolvedValueOnce(response(preferences))
    renderForm({ preferences })

    await waitFor(() =>
      expect(screen.getByLabelText('Timezone')).toHaveTextContent('America/Los_Angeles'),
    )
    expect(updateMyEmailPreferences).not.toHaveBeenCalled()
    dateTimeFormatSpy.mockRestore()
  })

  it('keeps a saved timezone instead of detecting a replacement', async () => {
    const dateTimeFormatSpy = vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
      resolvedOptions: () => ({ timeZone: 'America/New_York' }),
    } as Intl.DateTimeFormat)
    renderForm()

    await waitFor(() => expect(getMyEmailPreferences).toHaveBeenCalled())
    expect(updateMyEmailPreferences).not.toHaveBeenCalled()
    dateTimeFormatSpy.mockRestore()
  })

  it('displays a valid saved timezone even when it is absent from the browser list', async () => {
    const preferences = { ...defaultPreferences, moderation_email_timezone: 'UTC' }
    vi.mocked(getMyEmailPreferences).mockResolvedValueOnce(response(preferences))
    renderForm({ preferences })

    await waitFor(() => expect(screen.getByLabelText('Timezone')).toHaveTextContent('UTC'))
    fireEvent.click(screen.getByLabelText('Timezone'))
    expect(await screen.findByRole('option', { name: 'UTC' })).toBeVisible()
    expect(updateMyEmailPreferences).not.toHaveBeenCalled()
  })

  it('hides schedule fields while moderation email is off and preserves them when re-enabled', async () => {
    renderForm()
    await waitFor(() => expect(getMyEmailPreferences).toHaveBeenCalled())
    fireEvent.click(screen.getByLabelText('Community moderation summary'))
    await waitFor(() =>
      expect(screen.queryAllByLabelText(/^(Cadence|Time|Timezone)$/)).toHaveLength(0),
    )
    await waitFor(() => expect(screen.getByLabelText('Community moderation summary')).toBeEnabled())
    fireEvent.click(screen.getByLabelText('Community moderation summary'))
    await waitFor(() => expect(screen.getByLabelText('Cadence')).toBeInTheDocument())
    expect(screen.getByLabelText('Time')).toHaveValue('09:00')
  })

  it('shows days only for selected-days and prevents removing the final day', async () => {
    renderForm({
      preferences: {
        ...defaultPreferences,
        moderation_email_cadence: 'selected_days',
        moderation_email_days_of_week: [1],
      },
    })

    expect(screen.getByLabelText('Mon')).toBeDisabled()
    fireEvent.click(screen.getByLabelText('Mon'))
    expect(updateMyEmailPreferences).not.toHaveBeenCalled()

    await select('Cadence', 'Daily')
    await waitFor(() => expect(screen.queryByLabelText('Mon')).not.toBeInTheDocument())
  })
})
