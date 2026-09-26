import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { createTranslator, type MessageKey } from '@ts-shared/ui-messages'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'
import { formatUtcDate } from '@ts-shared/utils/format'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { UiLocaleContext } from '@/lib/i18n/ui-locale-context'
import type { ListResponse } from '@/types/api-responses'
import type { OAuthApp } from '@/types/oauth-apps'
import { OAuthAppsManager } from '../oauth-apps-manager'
import listFixture from '../../../../api-fixtures/v1/responses/web.my.oauth-apps.paginated.json'

let translate!: (key: MessageKey, params?: Record<string, unknown>) => string

vi.mock(import('@/lib/i18n/use-translations'), () => ({
  useTranslations: () => translate,
}))

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: {
        success: vi.fn<VitestLooseMock>(),
        error: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/api/client/oauth-apps'), () => ({
  createOAuthApp: vi.fn<VitestLooseMock>(),
  getOAuthApps: vi.fn<VitestLooseMock>(),
  revokeOAuthApp: vi.fn<VitestLooseMock>(),
  rotateOAuthAppSecret: vi.fn<VitestLooseMock>(),
  updateOAuthApp: vi.fn<VitestLooseMock>(),
}))

import { revokeOAuthApp, rotateOAuthAppSecret, updateOAuthApp } from '@/lib/api/client/oauth-apps'
import { toast } from 'sonner'

const mockRevoke = vi.mocked(revokeOAuthApp)
const mockRotate = vi.mocked(rotateOAuthAppSecret)
const mockUpdate = vi.mocked(updateOAuthApp)
const fixtureApp = (listFixture as ListResponse<OAuthApp>).results[0]!
const appId = fixtureApp.id

const secondApp: OAuthApp = {
  ...fixtureApp,
  id: 'second-app',
  client_id: 'voucha_second-app',
  client_name: 'Second Agent',
}

function renderApps(results: OAuthApp[], uiLocale = 'en-US') {
  render(
    <UiLocaleContext.Provider value={uiLocale}>
      <OAuthAppsManager
        initialData={{
          results,
          page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
        }}
        scopeCatalog={[]}
      />
    </UiLocaleContext.Provider>,
  )
}

function renderApp(overrides: Partial<OAuthApp> = {}) {
  renderApps([{ ...fixtureApp, ...overrides }])
  return rowFor('Fixture Agent')
}

function rowFor(name: string) {
  return screen.getByText(name).closest('li')!
}

function shownSecrets() {
  return screen.queryAllByLabelText('Client secret').map(input => (input as HTMLInputElement).value)
}

async function click(name: string | RegExp, container: HTMLElement = document.body) {
  await act(async () => {
    fireEvent.click(within(container).getByRole('button', { name }))
  })
}

describe('OAuthAppRow', () => {
  beforeAll(() => {
    translate = createTranslator('en', enMessages)
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockRevoke.mockResolvedValue(undefined)
  })

  it('shows the app credentials, redirect URIs, scopes, and registration date', () => {
    const row = renderApp()

    expect(within(row).getByText('Confidential')).toBeInTheDocument()
    expect(within(row).getByText('Client ID: voucha_fixture-app')).toBeInTheDocument()
    expect(within(row).getByText('https://agent.example.com/oauth/callback')).toBeInTheDocument()
    expect(within(row).getByText('mcp.user:write')).toBeInTheDocument()
    expect(within(row).getByText(/^Registered /)).toBeInTheDocument()
    expect(within(row).queryByText('Verified')).not.toBeInTheDocument()
  })

  it('formats the registration date in the selected UI locale', () => {
    renderApps([fixtureApp], 'fr')

    const createdAt = formatUtcDate(fixtureApp.created_at, 'fr')
    expect(createdAt).not.toBe(formatUtcDate(fixtureApp.created_at))
    expect(within(rowFor('Fixture Agent')).getByText(`Registered ${createdAt}`)).toBeInTheDocument()
  })

  it('saves only the changed fields and shows the server response', async () => {
    mockUpdate.mockResolvedValueOnce({
      oauth_app: { ...fixtureApp, client_name: 'Renamed Agent' },
    })
    const row = renderApp()
    await click('Edit', row)

    const save = within(row).getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    fireEvent.change(within(row).getByLabelText('App name'), {
      target: { value: 'Renamed Agent' },
    })
    await click('Save', row)

    expect(mockUpdate).toHaveBeenCalledWith(appId, { client_name: 'Renamed Agent' })
    expect(toast.success).toHaveBeenCalledWith('OAuth app saved')
    expect(screen.getByText('Renamed Agent')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('keeps the edit form open when saving fails', async () => {
    mockUpdate.mockRejectedValueOnce(new Error('boom'))
    const row = renderApp()
    await click('Edit', row)
    fireEvent.change(within(row).getByLabelText('Redirect URIs'), {
      target: { value: 'https://agent.example.com/new-callback' },
    })
    await click('Save', row)

    expect(mockUpdate).toHaveBeenCalledWith(appId, {
      redirect_uris: ['https://agent.example.com/new-callback'],
    })
    expect(toast.error).toHaveBeenCalledWith('Failed to save the OAuth app')
    expect(within(row).getByRole('button', { name: 'Save' })).toBeInTheDocument()

    await click('Cancel', row)
    expect(within(row).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })

  it('keeps Cancel disabled until a pending save settles', async () => {
    let settleSave!: (saved: { oauth_app: OAuthApp }) => void
    mockUpdate.mockReturnValueOnce(
      new Promise(resolve => {
        settleSave = resolve
      }),
    )
    const row = renderApp()
    await click('Edit', row)
    fireEvent.change(within(row).getByLabelText('App name'), {
      target: { value: 'Renamed Agent' },
    })
    await click('Save', row)

    expect(within(row).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await act(async () => {
      settleSave({ oauth_app: { ...fixtureApp, client_name: 'Renamed Agent' } })
    })
    expect(screen.getByText('Renamed Agent')).toBeInTheDocument()
  })

  it('warns that editing a verified app changes what users see', async () => {
    const row = renderApp({ verified_at: '2026-09-02T12:00:00.000Z' })

    expect(within(row).getByText('Verified')).toBeInTheDocument()
    await click('Edit', row)
    expect(within(row).getByText(/Changing the name or redirect URIs/)).toBeInTheDocument()
  })

  it('rotates the client secret after confirmation', async () => {
    mockRotate.mockResolvedValueOnce({ oauth_app: fixtureApp, client_secret: 'rotated-secret' })
    const row = renderApp()

    await click('Rotate secret', row)
    expect(within(row).getByText(/Replace the client secret\?/)).toBeInTheDocument()
    await click('Confirm', row)

    expect(mockRotate).toHaveBeenCalledWith(appId)
    expect(screen.getByLabelText('Client secret')).toHaveValue('rotated-secret')
    expect(within(row).getByRole('button', { name: 'Rotate secret' })).toBeInTheDocument()
  })

  it('keeps the newest secret per app until it is dismissed or the app is revoked', async () => {
    mockRotate
      .mockResolvedValueOnce({ oauth_app: fixtureApp, client_secret: 'first-secret' })
      .mockResolvedValueOnce({ oauth_app: secondApp, client_secret: 'second-secret' })
      .mockResolvedValueOnce({ oauth_app: fixtureApp, client_secret: 'first-secret-rotated' })
    renderApps([fixtureApp, secondApp])

    for (const name of ['Fixture Agent', 'Second Agent', 'Fixture Agent']) {
      await click('Rotate secret', rowFor(name))
      await click('Confirm', rowFor(name))
    }
    expect(shownSecrets()).toEqual(['first-secret-rotated', 'second-secret'])

    await click('Revoke', rowFor('Second Agent'))
    await click('Confirm', rowFor('Second Agent'))
    expect(shownSecrets()).toEqual(['first-secret-rotated'])

    await click('Dismiss')
    expect(shownSecrets()).toEqual([])
  })

  it('reports a failed secret rotation', async () => {
    mockRotate.mockRejectedValueOnce(new Error('boom'))
    const row = renderApp()

    await click('Rotate secret', row)
    await click('Confirm', row)

    expect(toast.error).toHaveBeenCalledWith('Failed to rotate the client secret')
    expect(screen.queryByLabelText('Client secret')).not.toBeInTheDocument()
  })

  it('offers no secret rotation for public apps', () => {
    const row = renderApp({ client_type: 'public', token_endpoint_auth_method: 'none' })

    expect(within(row).getByText('Public')).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: 'Rotate secret' })).not.toBeInTheDocument()
  })

  it('revokes the app after confirmation and supports cancelling', async () => {
    const row = renderApp()

    await click('Revoke', row)
    expect(within(row).getByText('Revoke this app and every token it holds?')).toBeInTheDocument()
    await click('Cancel', row)
    expect(mockRevoke).not.toHaveBeenCalled()

    await click('Revoke', row)
    await click('Confirm', row)

    expect(mockRevoke).toHaveBeenCalledWith(appId)
    expect(toast.success).toHaveBeenCalledWith('OAuth app revoked')
    expect(screen.queryByText('Fixture Agent')).not.toBeInTheDocument()
  })

  it('keeps the app listed when revoking fails', async () => {
    mockRevoke.mockRejectedValueOnce(new Error('boom'))
    const row = renderApp()

    await click('Revoke', row)
    await click('Confirm', row)

    expect(toast.error).toHaveBeenCalledWith('Failed to revoke the OAuth app')
    expect(screen.getByText('Fixture Agent')).toBeInTheDocument()
  })
})
