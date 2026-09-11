import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FacebookLoginButton } from './oauth-provider-buttons'

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
