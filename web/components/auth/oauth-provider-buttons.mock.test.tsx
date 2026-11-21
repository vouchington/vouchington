import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppleAuth } from '@/hooks/use-apple-auth'
import { useGithubAuth } from '@/hooks/use-github-auth'
import { useGoogleAuth } from '@/hooks/use-google-auth'
import { useLinkedInAuth } from '@/hooks/use-linkedin-auth'
import { useMicrosoftAuth } from '@/hooks/use-microsoft-auth'
import { useXAuth } from '@/hooks/use-x-auth'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  AppleLoginButton,
  FacebookLoginButton,
  GithubLoginButton,
  GoogleLoginButton,
  LinkedInLoginButton,
  MicrosoftLoginButton,
  XLoginButton,
} from './oauth-provider-buttons'

const mockUseFacebookSDK = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(import('@/hooks/use-apple-auth'), () => ({
  useAppleAuth: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/hooks/use-google-auth'), () => ({
  useGoogleAuth: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/hooks/use-x-auth'), () => ({
  useXAuth: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/hooks/use-linkedin-auth'), () => ({
  useLinkedInAuth: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/hooks/use-microsoft-auth'), () => ({
  useMicrosoftAuth: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/hooks/use-facebook-sdk'), () => ({
  useFacebookSDK: mockUseFacebookSDK,
}))

vi.mock(import('@/hooks/use-github-auth'), () => ({
  useGithubAuth: vi.fn<VitestLooseMock>(),
}))

function renderWithTooltipProvider(ui: React.ReactNode) {
  return render(<TooltipProvider>{ui}</TooltipProvider>)
}

describe('FacebookLoginButton', () => {
  beforeEach(() => {
    mockUseFacebookSDK.mockReset()
    mockUseFacebookSDK.mockReturnValue({ isAvailable: false })
  })

  it('uses an aria-disabled button trigger for the full unavailable state', () => {
    const onToken = vi.fn<VitestLooseMock>()

    renderWithTooltipProvider(<FacebookLoginButton onToken={onToken} />)

    const button = screen.getByRole('button', { name: 'Continue with Facebook (unavailable)' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).not.toBeDisabled()
    expect(button.className).toContain('bg-[#166FE5]')

    fireEvent.click(button)
    expect(onToken).not.toHaveBeenCalled()
  })
})

const ready = { isAvailable: true, isLoaded: true }
const popupResult = {
  code: 'code',
  codeVerifier: 'verifier',
  redirectUri: 'https://example.test/cb',
}

describe('direct provider buttons', () => {
  beforeEach(() => {
    mockUseFacebookSDK.mockReset()
  })

  it.each([
    {
      name: 'Apple',
      wrapper: 'oauth-apple-login-button',
      Button: AppleLoginButton,
      setup: () =>
        vi.mocked(useAppleAuth).mockReturnValue({
          ...ready,
          login: async () => ({ token: 'apple-token', nonce: 'nonce', userData: undefined }),
        }),
      token: { provider: 'apple', token: 'apple-token', nonce: 'nonce', userData: undefined },
    },
    {
      name: 'Facebook',
      wrapper: 'oauth-facebook-login-button',
      Button: FacebookLoginButton,
      setup: () =>
        mockUseFacebookSDK.mockReturnValue({ ...ready, login: async () => 'facebook-token' }),
      token: { provider: 'facebook', token: 'facebook-token' },
    },
    {
      name: 'GitHub',
      wrapper: 'oauth-github-login-button',
      Button: GithubLoginButton,
      setup: () =>
        vi.mocked(useGithubAuth).mockReturnValue({ ...ready, login: async () => popupResult }),
      token: { provider: 'github', ...popupResult },
    },
    {
      name: 'Google',
      wrapper: 'oauth-google-login-button',
      Button: GoogleLoginButton,
      setup: () =>
        vi.mocked(useGoogleAuth).mockReturnValue({ ...ready, login: async () => 'credential' }),
      token: { provider: 'google', credential: 'credential' },
    },
    {
      name: 'LinkedIn',
      wrapper: 'oauth-linkedin-login-button',
      Button: LinkedInLoginButton,
      setup: () =>
        vi.mocked(useLinkedInAuth).mockReturnValue({ ...ready, login: async () => popupResult }),
      token: { provider: 'linkedin', ...popupResult },
    },
    {
      name: 'Microsoft',
      wrapper: 'oauth-microsoft-login-button',
      Button: MicrosoftLoginButton,
      setup: () =>
        vi.mocked(useMicrosoftAuth).mockReturnValue({ ...ready, login: async () => popupResult }),
      token: { provider: 'microsoft', ...popupResult },
    },
    {
      name: 'X',
      wrapper: 'oauth-x-login-button',
      Button: XLoginButton,
      setup: () =>
        vi.mocked(useXAuth).mockReturnValue({ ...ready, login: async () => popupResult }),
      token: { provider: 'x', ...popupResult },
    },
  ])('$name signs in inside its wrapper', async ({ name, wrapper, Button, setup, token }) => {
    setup()
    const onToken = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)

    const { container } = renderWithTooltipProvider(<Button onToken={onToken} />)
    fireEvent.click(screen.getByRole('button', { name: `Continue with ${name}` }))

    await waitFor(() => expect(onToken).toHaveBeenCalledWith(token))
    expect(container.querySelector(`[data-pw="${wrapper}"]`)).not.toBeNull()
  })
})
