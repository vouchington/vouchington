import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import GithubCallbackPage from '../github/page'
import LinkedInCallbackPage from '../linkedin/page'
import MicrosoftCallbackPage from '../microsoft/page'
import XCallbackPage from '../x/page'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

const mockNav = createNavMock()
const originalCloseDescriptor = Object.getOwnPropertyDescriptor(window, 'close')
const originalOpenerDescriptor = Object.getOwnPropertyDescriptor(window, 'opener')

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
    Object.defineProperty(window, 'opener', {
      configurable: true,
      value: { postMessage: vi.fn<VitestLooseMock>() },
    })
    Object.defineProperty(window, 'close', {
      configurable: true,
      value: vi.fn<VitestLooseMock>(),
    })
  })

  afterEach(() => {
    restoreWindowProperty('close', originalCloseDescriptor)
    restoreWindowProperty('opener', originalOpenerDescriptor)
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

function restoreWindowProperty(
  propertyName: 'close' | 'opener',
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) {
    Object.defineProperty(window, propertyName, descriptor)
  } else {
    delete (window as Window & Partial<Record<typeof propertyName, unknown>>)[propertyName]
  }
}
