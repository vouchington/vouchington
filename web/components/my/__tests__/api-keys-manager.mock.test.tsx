import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { createTranslator, type MessageKey } from '@ts-shared/ui-messages'
import { ApiKeysManager } from '../api-keys-manager'
import type { ApiKey } from '@/types/api-keys'
import { AuthProvider } from '@/lib/auth/auth-provider'
import type { User } from '@/types/user'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'

// ApiKeysManager (and its child components) call useTranslations(), which suspends via `use()`
// on the real dynamic import. Mocking the hook (rather than wrapping every render in <Suspense>)
// keeps this file's existing synchronous render()/fireEvent flow intact while still resolving
// keys against the real `en` catalog, so drift in ts-shared/ui-messages/messages/en.ts still
// breaks this test. See language-form.mock.test.tsx for the same pattern.
let translate!: (key: MessageKey, params?: Record<string, unknown>) => string

vi.mock(import('@/lib/i18n/use-translations'), () => ({
  useTranslations: () => translate,
}))

// Mock toast notification library
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

// Mock client API calls
vi.mock(import('@/lib/api/client/api-keys'), () => ({
  createApiKey: vi.fn<VitestLooseMock>(),
  getApiKeys: vi.fn<VitestLooseMock>(),
  revokeApiKey: vi.fn<VitestLooseMock>(),
}))

import { createApiKey, getApiKeys, revokeApiKey } from '@/lib/api/client/api-keys'
import { toast } from 'sonner'

const mockCreate = vi.mocked(createApiKey)
const mockGet = vi.mocked(getApiKeys)
const mockRevoke = vi.mocked(revokeApiKey)
const mockToastSuccess = vi.mocked(toast.success)
const mockToastError = vi.mocked(toast.error)

const initialApiKeys: ApiKey[] = [
  {
    id: 'key-1',
    label: 'FeedReader',
    prefix: 'rss_live_123',
    type: 'rss',
    permissions: ['rss-feeds:read'],
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
    last_used_at: null,
    revoked_at: null,
  },
  {
    id: 'key-2',
    label: 'OldReader',
    prefix: 'rss_live_456',
    type: 'rss',
    permissions: ['rss-feeds:read'],
    created_at: '2022-01-01T00:00:00Z',
    updated_at: '2022-01-01T00:00:00Z',
    last_used_at: '2022-06-01T00:00:00Z',
    revoked_at: '2022-12-31T00:00:00Z',
  },
]

const adminUser: User = {
  id: 'admin-user',
  username: 'admin',
  roles: ['administrator'],
}

function findCreateApiKeyButton() {
  return screen.findByRole('button', { name: /Create API Key/i })
}

describe('ApiKeysManager Integration Flow', () => {
  beforeAll(async () => {
    translate = createTranslator('en', enMessages)
  })

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock navigator clipboard API
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: {
        writeText: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
      },
    })

    mockGet.mockResolvedValue({
      results: initialApiKeys,
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })

    mockCreate.mockResolvedValue({
      raw_key: 'voucha_rss_789_full_secret_value',
      api_key: {
        id: 'key-3',
        label: 'New RSS Reader',
        prefix: 'rss_live_789',
        type: 'rss',
        permissions: ['rss-feeds:read'],
        created_at: '2026-05-22T04:00:00Z',
        updated_at: '2026-05-22T04:00:00Z',
        last_used_at: null,
        revoked_at: null,
      },
    })

    mockRevoke.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders loading state initially then loads and displays API keys', async () => {
    render(<ApiKeysManager />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalled()
      expect(screen.getByText('FeedReader')).toBeInTheDocument()
      expect(screen.getByText('rss_live_123...')).toBeInTheDocument()
      expect(screen.getByText('Revoked Keys')).toBeInTheDocument()
      expect(screen.getByText('OldReader')).toBeInTheDocument()
    })
  })

  it('handles load error notification and displays message', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network error'))
    render(<ApiKeysManager />)

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to load API keys')
      expect(screen.getByText('Failed to load API keys. Please refresh.')).toBeInTheDocument()
    })
  })

  it('toggles creation form, validates input, and cancels', async () => {
    render(<ApiKeysManager />)
    await waitFor(() => expect(mockGet).toHaveBeenCalled())

    const createButton = await findCreateApiKeyButton()
    fireEvent.click(createButton)

    // Form should be visible
    expect(screen.getByText('Create API key')).toBeInTheDocument()

    const submitButton = screen.getByRole('button', { name: /^Create$/ })
    expect(submitButton).toBeDisabled()

    // Cancel form
    const cancelButton = screen.getByRole('button', { name: /Cancel/i })
    fireEvent.click(cancelButton)
    expect(screen.queryByText('Create API key')).not.toBeInTheDocument()
  })

  it('successfully creates an API key and allows copying the raw key', async () => {
    render(<ApiKeysManager />)
    await waitFor(() => expect(mockGet).toHaveBeenCalled())

    fireEvent.click(await findCreateApiKeyButton())

    const labelInput = screen.getByLabelText('Label')
    fireEvent.change(labelInput, { target: { value: 'New RSS Reader' } })

    const submitButton = screen.getByRole('button', { name: /^Create$/ })
    await act(async () => {
      fireEvent.click(submitButton)
    })

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith('New RSS Reader', 'rss', ['rss-feeds:read'])
      expect(screen.getByText('New RSS Reader')).toBeInTheDocument()
      expect(screen.getByText('Save your API key - it will only be shown once')).toBeInTheDocument()
    })

    // Test clipboard copy
    const copyButton = screen.getByLabelText('Copy API key')
    await act(async () => {
      fireEvent.click(copyButton)
    })
    expect(document.querySelector('[data-pw="api-keys-created-alert"]')).not.toBeNull()
    expect(document.querySelector('[data-pw="api-keys-created-raw-key-input"]')).toHaveValue(
      'voucha_rss_789_full_secret_value',
    )

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('voucha_rss_789_full_secret_value')

    // Dismiss generated key alert
    const dismissButton = screen.getByRole('button', { name: /Dismiss/i })
    fireEvent.click(dismissButton)
    expect(
      screen.queryByText('Save your API key - it will only be shown once'),
    ).not.toBeInTheDocument()
  })

  it('creates a user MCP read-write key from the preset selector', async () => {
    render(<ApiKeysManager />)
    await waitFor(() => expect(mockGet).toHaveBeenCalled())

    fireEvent.click(await findCreateApiKeyButton())
    fireEvent.click(screen.getByLabelText('User MCP read/write'))
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Codex user MCP' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Create$/ }))
    })

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith('Codex user MCP', 'mcp', [
        'mcp-tools:read',
        'mcp-tools:write',
      ])
    })
  })

  it('hides admin MCP presets for non-admin users', async () => {
    render(<ApiKeysManager />)
    await waitFor(() => expect(mockGet).toHaveBeenCalled())

    fireEvent.click(await findCreateApiKeyButton())

    expect(screen.queryByLabelText('Admin MCP read-only')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Admin MCP read/write')).not.toBeInTheDocument()
  })

  it('creates an admin MCP read-write key for administrators', async () => {
    render(
      <AuthProvider
        initialUser={{ id: adminUser.id, roles: adminUser.roles, isOfficialAccount: true }}
      >
        <ApiKeysManager />
      </AuthProvider>,
    )
    await waitFor(() => expect(mockGet).toHaveBeenCalled())

    fireEvent.click(await findCreateApiKeyButton())
    fireEvent.click(screen.getByLabelText('Admin MCP read/write'))
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Claude admin MCP' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Create$/ }))
    })

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith('Claude admin MCP', 'mcp', [
        'mcp-admin-tools:read',
        'mcp-admin-tools:write',
      ])
    })
  })

  it('supports revoking an API key with confirmation', async () => {
    render(<ApiKeysManager />)
    await waitFor(() => expect(mockGet).toHaveBeenCalled())

    const revokeButton = await screen.findByRole('button', { name: /Revoke/i })
    fireEvent.click(revokeButton)

    // Confirm prompt should be visible
    expect(screen.getByText('Revoke key?')).toBeInTheDocument()

    // Cancel revoke
    const cancelButton = screen.getByRole('button', { name: /Cancel/i })
    fireEvent.click(cancelButton)
    expect(screen.queryByText('Revoke key?')).not.toBeInTheDocument()

    // Confirm revoke actually revokes the key
    fireEvent.click(screen.getByRole('button', { name: /Revoke/i }))
    const confirmButton = screen.getByRole('button', { name: /Confirm/i })
    await act(async () => {
      fireEvent.click(confirmButton)
    })

    await waitFor(() => {
      expect(mockRevoke).toHaveBeenCalledWith('key-1')
      expect(mockToastSuccess).toHaveBeenCalledWith('API key revoked')
      expect(screen.getByText('FeedReader').closest('li')).toHaveAttribute(
        'data-pw',
        'api-key-revoked-row',
      )
    })
  })
})
