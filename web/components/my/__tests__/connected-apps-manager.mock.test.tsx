import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createTranslator, type MessageKey } from '@ts-shared/ui-messages'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ListResponse } from '@/types/api-responses'
import type { OAuthGrant } from '@/types/oauth-apps'
import { ConnectedAppsManager } from '../connected-apps-manager'
import grantsFixture from '../../../../api-fixtures/v1/responses/native.my.oauth-grants.paginated.json'

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

vi.mock(import('@/lib/api/client/oauth-grants'), () => ({
  getOAuthGrants: vi.fn<VitestLooseMock>(),
  revokeOAuthGrant: vi.fn<VitestLooseMock>(),
}))

import { getOAuthGrants, revokeOAuthGrant } from '@/lib/api/client/oauth-grants'
import { toast } from 'sonner'

const mockGet = vi.mocked(getOAuthGrants)
const mockRevoke = vi.mocked(revokeOAuthGrant)
const fixturePage = grantsFixture as ListResponse<OAuthGrant>
const fixtureGrant = fixturePage.results[0]!
const lastPage = { has_next_page: false, end_cursor: null, start_cursor: null }

function renderGrant(overrides: Partial<OAuthGrant> = {}) {
  render(
    <ConnectedAppsManager
      initialData={{ results: [{ ...fixtureGrant, ...overrides }], page_info: lastPage }}
    />,
  )
  return screen.getByText(overrides.client?.client_name ?? 'Fixture Agent').closest('li')!
}

async function click(container: HTMLElement, name: string) {
  await act(async () => {
    fireEvent.click(within(container).getByRole('button', { name }))
  })
}

describe('ConnectedAppsManager', () => {
  beforeAll(() => {
    translate = createTranslator('en', enMessages)
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockRevoke.mockResolvedValue(undefined)
  })

  it('shows each authorized app with its resource, scopes, and dates', () => {
    const row = renderGrant()

    expect(within(row).getByText('Verified')).toBeInTheDocument()
    expect(within(row).getByText('https://voucha.ai/api/v1/mcp')).toBeInTheDocument()
    expect(within(row).getByText('mcp.user:read')).toBeInTheDocument()
    expect(within(row).getByText(/^Authorized .+ · Last used /)).toBeInTheDocument()
  })

  it('marks apps that staff have not verified', () => {
    const row = renderGrant({
      client: { ...fixtureGrant.client, client_name: 'Unknown Agent', verified: false },
    })

    expect(within(row).getByText('Unverified')).toBeInTheDocument()
  })

  it('shows the empty state when no apps have access', () => {
    render(<ConnectedAppsManager initialData={{ results: [], page_info: lastPage }} />)

    expect(screen.getByText('No apps have access to your account.')).toBeInTheDocument()
  })

  it('revokes access after confirmation and supports cancelling', async () => {
    const row = renderGrant()

    await click(row, 'Revoke access')
    expect(within(row).getByText('Revoke access?')).toBeInTheDocument()
    await click(row, 'Cancel')
    expect(mockRevoke).not.toHaveBeenCalled()

    await click(row, 'Revoke access')
    await click(row, 'Confirm')

    expect(mockRevoke).toHaveBeenCalledWith(fixtureGrant.id)
    expect(toast.success).toHaveBeenCalledWith('Access revoked')
    expect(screen.getByText('No apps have access to your account.')).toBeInTheDocument()
  })

  it('keeps the app listed when revoking fails', async () => {
    mockRevoke.mockRejectedValueOnce(new Error('boom'))
    const row = renderGrant()

    await click(row, 'Revoke access')
    await click(row, 'Confirm')

    expect(toast.error).toHaveBeenCalledWith('Failed to revoke access')
    expect(within(row).getByRole('button', { name: 'Revoke access' })).toBeInTheDocument()
  })

  it('loads the next page of authorized apps', async () => {
    mockGet.mockResolvedValueOnce({
      results: [
        {
          ...fixtureGrant,
          id: 'grant-2',
          client: { ...fixtureGrant.client, client_name: 'Second Agent' },
        },
      ],
      page_info: lastPage,
    })
    render(<ConnectedAppsManager initialData={fixturePage} />)

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    expect(await screen.findByText('Second Agent')).toBeInTheDocument()
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith({ after: 'fixture-oauth-grant-end-cursor' })
    })
  })
})
