import { act, fireEvent, render, screen } from '@testing-library/react'
import { createTranslator, type MessageKey } from '@ts-shared/ui-messages'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'
import { formatUtcDate } from '@ts-shared/utils/format'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { UiLocaleContext } from '@/lib/i18n/ui-locale-context'
import type { ListResponse } from '@/types/api-responses'
import type { AdminOAuthClientListItem } from '@/types/oauth-apps'
import { OAuthClientVerificationRow } from '../oauth-client-verification-row'
import listFixture from '../../../../../api-fixtures/v1/responses/web.admin.oauth-clients.list.json'
import verifyFixture from '../../../../../api-fixtures/v1/responses/web.admin.oauth-clients.verify.json'

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

vi.mock(
  import('@/lib/api/client'),
  () =>
    ({
      verifyOAuthClient: vi.fn<VitestLooseMock>(),
      unverifyOAuthClient: vi.fn<VitestLooseMock>(),
    }) as unknown as typeof import('@/lib/api/client'),
)

vi.mock(import('@/components/users/user-link'), () => ({
  UserLink: ({ user }: { user: { username?: string | null } }) => (
    <a href='#owner'>{user.username}</a>
  ),
}))

import { unverifyOAuthClient, verifyOAuthClient } from '@/lib/api/client'
import { toast } from 'sonner'

const mockVerify = vi.mocked(verifyOAuthClient)
const mockUnverify = vi.mocked(unverifyOAuthClient)
const fixtureClient = (listFixture as ListResponse<AdminOAuthClientListItem>).results[0]!

function renderRow(overrides: Partial<AdminOAuthClientListItem> = {}, uiLocale = 'en-US') {
  render(
    <UiLocaleContext.Provider value={uiLocale}>
      <table>
        <tbody>
          <OAuthClientVerificationRow client={{ ...fixtureClient, ...overrides }} />
        </tbody>
      </table>
    </UiLocaleContext.Provider>,
  )
}

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

describe('OAuthClientVerificationRow', () => {
  beforeAll(() => {
    translate = createTranslator('en', enMessages)
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockVerify.mockResolvedValue(verifyFixture as Awaited<ReturnType<typeof verifyOAuthClient>>)
    mockUnverify.mockResolvedValue(undefined as never)
  })

  it('shows the app, its owner, redirect URIs, and scopes', () => {
    renderRow()

    expect(screen.getByText('Fixture Agent')).toBeInTheDocument()
    expect(screen.getByText('voucha_fixture-app')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'fixture-user' })).toBeInTheDocument()
    expect(screen.getByText('https://agent.example.com/oauth/callback')).toBeInTheDocument()
    expect(screen.getByText('mcp.user:write')).toBeInTheDocument()
    expect(screen.getByText('Unverified')).toBeInTheDocument()
  })

  it('formats the registration and verification dates in the selected UI locale', () => {
    const verifiedAt = '2026-09-02T12:00:00.000Z'
    renderRow({ verified_at: verifiedAt }, 'fr')

    const createdAt = formatUtcDate(fixtureClient.created_at, 'fr')
    expect(createdAt).not.toBe(formatUtcDate(fixtureClient.created_at))
    expect(screen.getByText(`Registered ${createdAt}`)).toBeInTheDocument()
    expect(screen.getByText(`Verified ${formatUtcDate(verifiedAt, 'fr')}`)).toBeInTheDocument()
  })

  it('says when an app has no owner', () => {
    renderRow({ owner: null, owner_user_id: null })

    expect(screen.getByText('No owner')).toBeInTheDocument()
  })

  it('verifies an app under the name and redirect URIs the administrator reviewed', async () => {
    renderRow()
    await click('Verify')

    expect(mockVerify).toHaveBeenCalledWith(fixtureClient.id, {
      client_name: 'Fixture Agent',
      redirect_uris: ['https://agent.example.com/oauth/callback'],
    })
    expect(toast.success).toHaveBeenCalledWith('App verified')
    expect(screen.getByText(/^Verified /)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove verification' })).toBeEnabled()
  })

  it('removes a verification', async () => {
    renderRow({ verified_at: '2026-09-02T12:00:00.000Z' })
    await click('Remove verification')

    expect(mockUnverify).toHaveBeenCalledWith(fixtureClient.id)
    expect(toast.success).toHaveBeenCalledWith('Verification removed')
    expect(screen.getByText('Unverified')).toBeInTheDocument()
  })

  it('keeps the current status when the update fails', async () => {
    mockVerify.mockRejectedValueOnce(new Error('boom'))
    renderRow()
    await click('Verify')

    expect(toast.error).toHaveBeenCalledWith('Failed to update the verification')
    expect(screen.getByText('Unverified')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Verify' })).toBeEnabled()
  })
})
