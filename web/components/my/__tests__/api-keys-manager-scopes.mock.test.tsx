import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createTranslator, type MessageKey } from '@ts-shared/ui-messages'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/lib/auth/auth-provider'
import type { ScopeCatalogResponse } from '@/types/scopes'
import { ApiKeysManager } from '../api-keys-manager'
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

vi.mock(import('@/lib/api/client/api-keys'), () => ({
  createApiKey: vi.fn<VitestLooseMock>(),
  getApiKeys: vi.fn<VitestLooseMock>(),
  revokeApiKey: vi.fn<VitestLooseMock>(),
}))

import { createApiKey, getApiKeys } from '@/lib/api/client/api-keys'

const mockCreate = vi.mocked(createApiKey)
const mockGet = vi.mocked(getApiKeys)
const scopeCatalog = (scopeCatalogFixture as ScopeCatalogResponse).scopes

function asAdmin(children: ReactNode) {
  return (
    <AuthProvider
      initialUser={{ id: 'admin-user', roles: ['administrator'], isOfficialAccount: true }}
    >
      {children}
    </AuthProvider>
  )
}

async function openMcpForm(ui: ReactNode = <ApiKeysManager scopeCatalog={scopeCatalog} />) {
  render(ui)
  await waitFor(() => expect(mockGet).toHaveBeenCalled())
  fireEvent.click(await screen.findByRole('button', { name: /Create API Key/i }))
  fireEvent.click(screen.getByRole('radio', { name: 'MCP server' }))
}

function checkbox(name: string) {
  return screen.getByRole('checkbox', { name })
}

async function createWithLabel(label: string) {
  fireEvent.change(screen.getByLabelText('Label'), { target: { value: label } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^Create$/ }))
  })
}

describe('ApiKeysManager scope selection', () => {
  beforeAll(() => {
    translate = createTranslator('en', enMessages)
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockResolvedValue({
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })
    mockCreate.mockResolvedValue({
      raw_key: 'voucha_mcp_fixture_secret',
      api_key: {
        id: 'key-mcp',
        label: 'Agent key',
        prefix: 'mcp_live_fixture',
        type: 'mcp',
        permissions: ['mcp.user:read', 'mcp.user:write'],
        created_at: '2026-05-22T04:00:00Z',
        updated_at: '2026-05-22T04:00:00Z',
        last_used_at: null,
        revoked_at: null,
      },
    })
  })

  it('creates a user MCP key with a write scope and its required read scope', async () => {
    await openMcpForm()

    fireEvent.click(checkbox('mcp.user Write'))
    expect(checkbox('mcp.user Read')).toBeChecked()
    await createWithLabel('Agent key')

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith('Agent key', 'mcp', [
        'mcp.user:read',
        'mcp.user:write',
      ])
    })
  })

  it('keeps Create disabled until an MCP key has a scope', async () => {
    await openMcpForm()
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Agent key' } })

    expect(screen.getByRole('button', { name: /^Create$/ })).toBeDisabled()
    fireEvent.click(checkbox('cards Read'))
    expect(screen.getByRole('button', { name: /^Create$/ })).toBeEnabled()
  })

  it('drops a write scope when its read scope is unchecked', async () => {
    await openMcpForm()

    fireEvent.click(checkbox('cards Write'))
    fireEvent.click(checkbox('cards Read'))

    expect(checkbox('cards Read')).not.toBeChecked()
    expect(checkbox('cards Write')).not.toBeChecked()
  })

  it('hides the audience choice and admin scopes from non-admin users', async () => {
    await openMcpForm()

    expect(screen.queryByRole('radio', { name: 'Administrator' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'mcp.admin Read' })).not.toBeInTheDocument()
  })

  it('creates an admin MCP key for administrators', async () => {
    await openMcpForm(asAdmin(<ApiKeysManager scopeCatalog={scopeCatalog} />))

    fireEvent.click(screen.getByRole('radio', { name: 'Administrator' }))
    expect(screen.queryByRole('checkbox', { name: 'mcp.user Read' })).not.toBeInTheDocument()
    fireEvent.click(checkbox('mcp.admin Write'))
    await createWithLabel('Admin agent key')

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith('Admin agent key', 'mcp', [
        'mcp.admin:read',
        'mcp.admin:write',
      ])
    })
  })

  it('clears chosen scopes when the audience changes', async () => {
    await openMcpForm(asAdmin(<ApiKeysManager scopeCatalog={scopeCatalog} />))

    fireEvent.click(checkbox('mcp.user Read'))
    fireEvent.click(screen.getByRole('radio', { name: 'Administrator' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Your account' }))

    expect(checkbox('mcp.user Read')).not.toBeChecked()
  })
})
