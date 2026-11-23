import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { navMockModule, createNavMock } from 'vouchington-tooling/next-navigation-mock'
import GithubCallbackPage from '../github/page'
import LinkedInCallbackPage from '../linkedin/page'
import MicrosoftCallbackPage from '../microsoft/page'
import XCallbackPage from '../x/page'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

const mockNav = createNavMock()

const CASES = [
  {
    Page: GithubCallbackPage,
    provider: 'github',
    label: 'Completing GitHub sign in',
  },
  {
    Page: LinkedInCallbackPage,
    provider: 'linkedin',
    label: 'Completing LinkedIn sign in',
  },
  {
    Page: MicrosoftCallbackPage,
    provider: 'microsoft',
    label: 'Completing Microsoft sign in',
  },
  {
    Page: XCallbackPage,
    provider: 'x',
    label: 'Completing X sign in',
  },
] as const

describe('OAuth callback pages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
    mockNav.setSearchParams('code=oauth-code&state=return-state')
    vi.stubGlobal('opener', { postMessage: vi.fn<VitestLooseMock>() })
    vi.stubGlobal('close', vi.fn<VitestLooseMock>())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  for (const { Page, provider, label } of CASES) {
    it(`posts ${provider} callback params to the opener`, async () => {
      render(<Page />)

      expect(screen.getByText('Completing sign in...')).toBeVisible()
      expect(screen.getByRole('heading', { name: label })).toHaveClass('sr-only')

      await waitFor(() => {
        expect(window.opener?.postMessage).toHaveBeenCalledWith(
          { provider, code: 'oauth-code', state: 'return-state', error: null },
          window.location.origin,
        )
      })
      expect(window.close).toHaveBeenCalled()
    })
  }
})
