import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTranslator } from '@ts-shared/ui-messages'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'
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

const { mockOnError } = vi.hoisted(() => ({ mockOnError: vi.fn<VitestLooseMock>() }))
const translate = createTranslator('en', enMessages)
vi.mock(import('@/lib/api/client/email-preferences'), () => ({
  getMyEmailPreferences: vi.fn<VitestLooseMock>(),
  updateMyEmailPreferences: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
  onSuccess: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/i18n/use-translations'), () => ({
  useTranslations: () => translate,
}))

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

function renderForm() {
  return render(
    <NotificationSettingsForm
      initialSettings={{
        ...defaultPreferences,
        moderation_email_timezone:
          defaultPreferences.moderation_email_timezone ?? 'America/Los_Angeles',
      }}
    />,
  )
}

describe('NotificationSettingsForm loading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps server settings visible and retries when the client refresh fails', async () => {
    vi.mocked(getMyEmailPreferences)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(response({ ...defaultPreferences, news_digest_frequency: 'daily' }))
    renderForm()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      translate('settings.notificationSettings.loadError'),
    )
    expect(screen.getByLabelText('News digest')).toHaveTextContent('Weekly')
    expect(mockOnError).toHaveBeenCalledWith(expect.any(Error), {
      fallback: translate('settings.notificationSettings.loadErrorFallback'),
      tags: { form: 'my-notification-settings' },
    })

    fireEvent.click(
      screen.getByRole('button', { name: translate('settings.notificationSettings.retry') }),
    )

    await waitFor(() => expect(getMyEmailPreferences).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.getByLabelText('News digest')).toHaveTextContent('Daily')
  })

  it('rolls back a dirty time edit to the late refresh baseline when its update fails', async () => {
    const load = deferred<ReturnType<typeof response>>()
    vi.mocked(getMyEmailPreferences).mockReturnValueOnce(load.promise)
    vi.mocked(updateMyEmailPreferences).mockRejectedValueOnce(new Error('network'))
    renderForm()

    await waitFor(() => expect(getMyEmailPreferences).toHaveBeenCalledTimes(1))
    const input = screen.getByLabelText('Time')
    fireEvent.change(input, { target: { value: '15:30' } })
    await act(async () => {
      load.resolve(response({ ...defaultPreferences, moderation_email_time_of_day: '08:00' }))
      await load.promise
    })

    expect(input).toHaveValue('15:30')
    expect(updateMyEmailPreferences).not.toHaveBeenCalled()

    fireEvent.blur(input)

    await waitFor(() => expect(input).toHaveValue('08:00'))
    expect(mockOnError).toHaveBeenCalledWith(expect.any(Error), {
      fallback: 'Failed to update notification setting',
      tags: { form: 'my-notification-settings', field: 'moderation_email_time_of_day' },
    })
  })

  it('clears a draft that is unchanged on blur so a later load can render it', async () => {
    const load = deferred<ReturnType<typeof response>>()
    vi.mocked(getMyEmailPreferences).mockReturnValueOnce(load.promise)
    renderForm()

    await waitFor(() => expect(getMyEmailPreferences).toHaveBeenCalledTimes(1))
    const input = screen.getByLabelText('Time')
    fireEvent.change(input, { target: { value: '15:30' } })
    fireEvent.change(input, { target: { value: '09:00' } })
    fireEvent.blur(input)
    expect(updateMyEmailPreferences).not.toHaveBeenCalled()
    await act(async () => {
      load.resolve(response({ ...defaultPreferences, moderation_email_time_of_day: '08:00' }))
      await load.promise
    })

    expect(input).toHaveValue('08:00')
  })

  it('allows re-enabling moderation emails after a late load follows a completed update', async () => {
    const load = deferred<ReturnType<typeof response>>()
    vi.mocked(getMyEmailPreferences).mockReturnValueOnce(load.promise)
    vi.mocked(updateMyEmailPreferences).mockImplementation(body =>
      Promise.resolve(response({ ...defaultPreferences, ...body })),
    )
    renderForm()

    await waitFor(() => expect(getMyEmailPreferences).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByLabelText('Community moderation summary'))
    await waitFor(() =>
      expect(updateMyEmailPreferences).toHaveBeenCalledWith({ moderation_emails_enabled: false }),
    )
    await act(async () => {
      load.resolve(response({ ...defaultPreferences, moderation_emails_enabled: true }))
      await load.promise
    })

    fireEvent.click(screen.getByLabelText('Community moderation summary'))
    await waitFor(() =>
      expect(updateMyEmailPreferences).toHaveBeenLastCalledWith({
        moderation_emails_enabled: true,
      }),
    )
  })

  it('offers UTC even when it is not the saved timezone', async () => {
    vi.mocked(getMyEmailPreferences).mockResolvedValueOnce(response())
    renderForm()

    fireEvent.click(screen.getByLabelText('Timezone'))

    expect(await screen.findByRole('option', { name: 'UTC' })).toBeVisible()
  })
})
