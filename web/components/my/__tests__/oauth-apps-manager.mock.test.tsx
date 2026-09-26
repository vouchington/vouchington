import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createTranslator, type MessageKey } from '@ts-shared/ui-messages'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/lib/auth/auth-provider'
import type { ListResponse } from '@/types/api-responses'
import type { IssuedOAuthApp, OAuthApp } from '@/types/oauth-apps'
import type { ScopeCatalogResponse } from '@/types/scopes'
import { OAuthAppsManager } from '../oauth-apps-manager'
import createdFixture from '../../../../api-fixtures/v1/responses/web.my.oauth-apps.create.json'
import listFixture from '../../../../api-fixtures/v1/responses/web.my.oauth-apps.paginated.json'
import scopeCatalogFixture from '../../../../api-fixtures/v1/responses/shared.scopes.catalog.json'

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

import { createOAuthApp, getOAuthApps } from '@/lib/api/client/oauth-apps'
import { toast } from 'sonner'

const mockCreate = vi.mocked(createOAuthApp)
const mockGet = vi.mocked(getOAuthApps)
const scopeCatalog = (scopeCatalogFixture as ScopeCatalogResponse).scopes
const fixturePage = listFixture as ListResponse<OAuthApp>
const issued = createdFixture as IssuedOAuthApp
const emptyPage: ListResponse<OAuthApp> = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
}

function renderManager(initialData = emptyPage) {
  return render(
    <OAuthAppsManager
      initialData={initialData}
      scopeCatalog={scopeCatalog}
    />,
  )
}

function fillRegisterForm({ name = 'Fixture Agent', publicClient = false } = {}) {
  fireEvent.change(screen.getByLabelText('App name'), { target: { value: ` ${name} ` } })
  fireEvent.change(screen.getByLabelText('Redirect URIs'), {
    target: { value: 'https://agent.example.com/oauth/callback\n\n' },
  })
  if (publicClient) fireEvent.click(screen.getByRole('radio', { name: /^Public/ }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'mcp.user Write' }))
}

async function submitRegisterForm() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Register app' }))
  })
}

describe('OAuthAppsManager', () => {
  const writeText = vi.fn<(text: string) => Promise<void>>()

  beforeAll(() => {
    translate = createTranslator('en', enMessages)
  })

  beforeEach(() => {
    vi.clearAllMocks()
    writeText.mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    mockCreate.mockResolvedValue(issued)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the empty state when no apps are registered', () => {
    renderManager()

    expect(screen.getByText('You have not registered any OAuth apps.')).toBeInTheDocument()
  })

  it('keeps Register disabled until the details and a scope are filled in', () => {
    renderManager()
    const register = screen.getByRole('button', { name: 'Register app' })

    expect(register).toBeDisabled()
    fireEvent.change(screen.getByLabelText('App name'), { target: { value: 'Agent' } })
    fireEvent.change(screen.getByLabelText('Redirect URIs'), {
      target: { value: 'https://agent.example.com/cb' },
    })
    expect(register).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'mcp.user Read' }))
    expect(register).toBeEnabled()
  })

  it('registers a confidential app and shows its client secret once', async () => {
    renderManager()
    fillRegisterForm()
    await submitRegisterForm()

    expect(mockCreate).toHaveBeenCalledWith({
      client_name: 'Fixture Agent',
      redirect_uris: ['https://agent.example.com/oauth/callback'],
      token_endpoint_auth_method: 'client_secret_basic',
      scopes: ['mcp.user:read', 'mcp.user:write'],
    })
    expect(toast.success).toHaveBeenCalledWith('OAuth app registered')
    expect(screen.getByLabelText('Client ID')).toHaveValue('voucha_fixture-app')
    expect(screen.getByLabelText('Client secret')).toHaveValue('fixture-client-secret')
    expect(screen.getByLabelText('App name')).toHaveValue('')
    expect(screen.getAllByText('Fixture Agent')).toHaveLength(1)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy client secret' }))
    })
    expect(writeText).toHaveBeenCalledWith('fixture-client-secret')
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByLabelText('Client secret')).not.toBeInTheDocument()
  })

  it('reports a failed clipboard copy', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'))
    renderManager()
    fillRegisterForm()
    await submitRegisterForm()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy client secret' }))
    })

    expect(toast.error).toHaveBeenCalledWith('Failed to copy to clipboard')
    expect(screen.getByRole('button', { name: 'Copy client secret' })).toBeInTheDocument()
  })

  it('registers a public app without issuing a client secret', async () => {
    mockCreate.mockResolvedValueOnce({
      client_secret: null,
      oauth_app: {
        ...issued.oauth_app,
        client_type: 'public',
        token_endpoint_auth_method: 'none',
      },
    })
    renderManager()
    fillRegisterForm({ publicClient: true })
    await submitRegisterForm()

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ token_endpoint_auth_method: 'none' }),
    )
    expect(screen.getByText('Public')).toBeInTheDocument()
    expect(screen.queryByLabelText('Client secret')).not.toBeInTheDocument()
  })

  it('keeps an outstanding client secret when a public app is registered next', async () => {
    renderManager()
    fillRegisterForm()
    await submitRegisterForm()
    mockCreate.mockResolvedValueOnce({
      client_secret: null,
      oauth_app: {
        ...issued.oauth_app,
        id: 'public-app',
        client_id: 'voucha_public-app',
        client_name: 'Public Agent',
        client_type: 'public',
        token_endpoint_auth_method: 'none',
      },
    })
    fillRegisterForm({ name: 'Public Agent', publicClient: true })
    await submitRegisterForm()

    expect(screen.getByText('Public Agent')).toBeInTheDocument()
    expect(screen.getByLabelText('Client secret')).toHaveValue('fixture-client-secret')
  })

  it('keeps the form filled in when registration fails', async () => {
    mockCreate.mockRejectedValueOnce(new Error('boom'))
    renderManager()
    fillRegisterForm()
    await submitRegisterForm()

    expect(toast.error).toHaveBeenCalledWith('Failed to register the OAuth app')
    expect(screen.getByLabelText('App name')).toHaveValue(' Fixture Agent ')
    expect(screen.getByText('You have not registered any OAuth apps.')).toBeInTheDocument()
  })

  it('offers admin scopes only to administrators', () => {
    const { unmount } = renderManager()
    expect(screen.queryByRole('checkbox', { name: 'mcp.admin Read' })).not.toBeInTheDocument()
    unmount()

    render(
      <AuthProvider
        initialUser={{ id: 'admin-user', roles: ['administrator'], isOfficialAccount: true }}
      >
        <OAuthAppsManager
          initialData={emptyPage}
          scopeCatalog={scopeCatalog}
        />
      </AuthProvider>,
    )
    expect(screen.getByRole('checkbox', { name: 'mcp.admin Read' })).toBeInTheDocument()
  })

  it('loads the next page of apps', async () => {
    mockGet.mockResolvedValueOnce({
      results: [{ ...fixturePage.results[0]!, id: 'app-2', client_name: 'Second Agent' }],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })
    renderManager(fixturePage)

    expect(screen.getByText('Fixture Agent')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    expect(await screen.findByText('Second Agent')).toBeInTheDocument()
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith({ after: 'fixture-oauth-app-end-cursor' })
    })
  })
})
