import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OAuthAuthorizationRequestResponse } from '@/types/oauth-authorization'

const { mockGetCurrentUser, mockGetAuthorizationRequest, mockNotFound, mockRedirect } = vi.hoisted(
  () => ({
    mockGetCurrentUser: vi.fn<VitestLooseMock>(),
    mockGetAuthorizationRequest: vi.fn<VitestLooseMock>(),
    mockNotFound: vi.fn<VitestLooseMock>(() => {
      throw new Error('NEXT_NOT_FOUND')
    }),
    mockRedirect: vi.fn<VitestLooseMock>((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`)
    }),
  }),
)

vi.mock(
  import('next/navigation'),
  () =>
    ({
      notFound: mockNotFound,
      redirect: mockRedirect,
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
}))

vi.mock(import('@/lib/api/server/oauth-authorization'), () => ({
  getOAuthAuthorizationRequest: mockGetAuthorizationRequest,
}))

vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))

vi.mock(import('@/components/page-with-aside'), () => ({
  PageWithAside: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))

vi.mock(import('./consent-actions'), () => ({
  ConsentActions: ({ requestId }: { requestId: string }) => (
    <div data-testid='consent-actions'>{requestId}</div>
  ),
}))

import OAuthConsentPage from './page'

const authorizationRequest: OAuthAuthorizationRequestResponse = {
  authorization_request: {
    id: 'request-1',
    client_name: 'Example app',
    client_hostname: null,
    resource: 'https://api.voucha.ai/api/v1/mcp',
    scopes: ['news:read', 'topics:read'],
    expires_at: '2026-09-20T21:00:00.000Z',
  },
}

describe('OAuthConsentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' })
    mockGetAuthorizationRequest.mockResolvedValue(authorizationRequest)
  })

  it('returns not found without a request identifier', async () => {
    await expect(OAuthConsentPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
    expect(mockGetCurrentUser).not.toHaveBeenCalled()
  })

  it('redirects anonymous users to login with the consent return path', async () => {
    mockGetCurrentUser.mockResolvedValue(null)

    await expect(
      OAuthConsentPage({ searchParams: Promise.resolve({ request_id: 'request/1' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/login?next=%2Foauth%2Fconsent%3Frequest_id%3Drequest%252F1')
    expect(mockGetAuthorizationRequest).not.toHaveBeenCalled()
  })

  it('returns not found when the authorization request no longer exists', async () => {
    mockGetAuthorizationRequest.mockResolvedValue(null)

    await expect(
      OAuthConsentPage({ searchParams: Promise.resolve({ request_id: 'missing' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockGetAuthorizationRequest).toHaveBeenCalledWith('missing')
  })

  it('renders the client, resource, scopes, and matching decision controls', async () => {
    mockGetAuthorizationRequest.mockResolvedValue({
      authorization_request: {
        ...authorizationRequest.authorization_request,
        scopes: ['post-relations.owned-private:write'],
      },
    })
    const ui = await OAuthConsentPage({
      searchParams: Promise.resolve({ request_id: 'request-1' }),
    })
    render(ui)

    expect(screen.getByText('Example app wants access to Voucha')).toBeDefined()
    expect(screen.getByText('https://api.voucha.ai/api/v1/mcp')).toBeDefined()
    expect(screen.getByText('post-relations.owned-private:write')).toBeDefined()
    expect(
      screen.getByText(
        'Allow this credential to add relations and tags to your own private posts.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByTestId('consent-actions')).toHaveTextContent('request-1')
  })

  it('shows the Client ID Metadata Document hostname with the reviewed client name', async () => {
    mockGetAuthorizationRequest.mockResolvedValue({
      authorization_request: {
        ...authorizationRequest.authorization_request,
        client_name: 'Reviewed app',
        client_hostname: 'client.example',
      },
    })
    render(
      await OAuthConsentPage({
        searchParams: Promise.resolve({ request_id: 'request-1' }),
      }),
    )

    expect(screen.getByText('Reviewed app wants access to Voucha')).toBeInTheDocument()
    expect(screen.getByText('client.example')).toBeInTheDocument()
  })
})
