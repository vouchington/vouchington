import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createTranslator, type MessageKey } from '@ts-shared/ui-messages'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/lib/auth/auth-provider'
import type { ScopeCatalogEntry, ScopeCatalogResponse } from '@/types/scopes'
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
const scopeCatalog: ScopeCatalogEntry[] = (scopeCatalogFixture as ScopeCatalogResponse).scopes.map(
  entry => ({
    ...entry,
    description_key:
      entry.resource === 'mcp.admin'
        ? 'mcp_admin_full_access'
        : entry.resource === 'mcp.user'
          ? 'mcp_user_full_access'
          : entry.resource === 'financial-profile'
            ? entry.action === 'read'
              ? 'financial_profile_read'
              : 'financial_profile_write'
            : entry.resource === 'spending'
              ? entry.action === 'read'
                ? 'spending_read'
                : 'spending_write'
              : null,
  }),
)

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

  it('describes each financial read and write permission', async () => {
    await openMcpForm()
    expect(screen.getByText(/Read your credit score range/)).toBeInTheDocument()
    expect(screen.getByText(/Update your credit score range/)).toBeInTheDocument()
    expect(screen.getByText(/Read your spending categories/)).toBeInTheDocument()
    expect(screen.getByText(/Add, update or remove your spending categories/)).toBeInTheDocument()
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

  it('describes and submits the exact own-private relation permission with its prerequisites', async () => {
    await openMcpForm()

    expect(
      screen.getByText(
        'Allow this credential to add relations and tags to your own private posts.',
      ),
    ).toBeInTheDocument()
    fireEvent.click(checkbox('post-relations.owned-private Write'))
    expect(checkbox('entity-relations Read')).toBeChecked()
    expect(checkbox('entity-relations Write')).toBeChecked()
    await createWithLabel('Private relation key')

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith('Private relation key', 'mcp', [
        'entity-relations:read',
        'entity-relations:write',
        'post-relations.owned-private:write',
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

  it.each([
    ['non-admin users', undefined],
    ['administrators', asAdmin(<ApiKeysManager scopeCatalog={scopeCatalog} />)],
  ])('offers no audience choice or admin scopes to %s', async (_label, ui) => {
    await openMcpForm(ui)

    expect(screen.queryByRole('radio', { name: 'Administrator' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'mcp.admin Read' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'mcp.admin Write' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'mcp.user Read' })).toBeInTheDocument()
  })

  it('renders the user catalogue description through localized copy', async () => {
    await openMcpForm()

    expect(screen.getByText(/excluding financial profile and spending/)).toBeInTheDocument()
    expect(screen.queryByText('Full administrator MCP access')).not.toBeInTheDocument()
  })

  it('uses an API-key-type-specific label example', async () => {
    render(<ApiKeysManager scopeCatalog={scopeCatalog} />)
    await waitFor(() => expect(mockGet).toHaveBeenCalled())
    fireEvent.click(await screen.findByRole('button', { name: /Create API Key/i }))

    expect(screen.getByPlaceholderText('e.g. My RSS reader')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'MCP server' }))
    expect(screen.getByPlaceholderText('e.g. Claude Code')).toBeInTheDocument()
  })
})
