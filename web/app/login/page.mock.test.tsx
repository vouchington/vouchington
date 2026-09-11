import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import LoginPage from './page'

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: vi.fn<VitestLooseMock>().mockResolvedValue(null),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      redirect: vi.fn<VitestLooseMock>(),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/auth/login-url'), () => ({
  sanitizeLoginNext: vi.fn<VitestLooseMock>().mockReturnValue('/'),
}))

vi.mock(import('@/components/auth/login-form'), () => ({
  LoginForm: ({ initialLoginAttemptId = '' }: { initialLoginAttemptId?: string }) => (
    <div
      data-testid='login-form'
      data-login-attempt-id={initialLoginAttemptId}
    />
  ),
}))

vi.mock(import('@/components/brand/voucha-logo'), () => ({
  VouchaLogo: () => <svg data-testid='voucha-logo' />,
}))

const loginUrlCleanupProps = vi.hoisted(() => ({ enabled: false }))

vi.mock(import('./login-url-cleanup'), () => ({
  LoginUrlCleanup: ({ enabled }: { enabled: boolean }) => {
    loginUrlCleanupProps.enabled = enabled
    return null
  },
}))

vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>().mockReturnValue({}),
}))

async function renderLogin(params: Record<string, string> = {}) {
  const jsx = await LoginPage({ searchParams: Promise.resolve(params) })
  return render(jsx)
}

describe('LoginPage intent messages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loginUrlCleanupProps.enabled = false
  })

  it('renders default intent message', async () => {
    await renderLogin()
    expect(screen.getByText(/use your email or a provider to get started/i)).toBeInTheDocument()
  })

  it('renders follow intent message', async () => {
    await renderLogin({ intent: 'follow' })
    expect(screen.getByText(/sign in to follow/i)).toBeInTheDocument()
  })

  it('renders vote intent message', async () => {
    await renderLogin({ intent: 'vote' })
    expect(screen.getByText(/sign in to cast your vote/i)).toBeInTheDocument()
  })

  it('renders write intent message', async () => {
    await renderLogin({ intent: 'write' })
    expect(screen.getByText(/sign in to start writing/i)).toBeInTheDocument()
  })

  it('hydrates broker MFA state before enabling URL cleanup', async () => {
    await renderLogin({ login_attempt_id: 'attempt-1' })

    expect(screen.getByTestId('login-form')).toHaveAttribute('data-login-attempt-id', 'attempt-1')
    expect(loginUrlCleanupProps.enabled).toBe(true)
  })

  it('starts a refreshed clean login URL without stale MFA state', async () => {
    await renderLogin()

    expect(screen.getByTestId('login-form')).toHaveAttribute('data-login-attempt-id', '')
    expect(loginUrlCleanupProps.enabled).toBe(false)
  })
})
