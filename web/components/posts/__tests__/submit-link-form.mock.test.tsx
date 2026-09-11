import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLinkPost } from '@/lib/api/client/posts'
import { SubmitLinkForm } from '../submit-link-form'

const mockPush = vi.fn<VitestLooseMock>()
const mockTurnstileReset = vi.fn<VitestLooseMock>()
const mockOpenEmailVerificationRecovery = vi.fn<VitestLooseMock>()

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ push: mockPush }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(
  import('@/hooks/use-turnstile-token'),
  () =>
    ({
      useTurnstileToken: () => ({
        token: 'test-token',
        reset: mockTurnstileReset,
        alwaysApprove: false,
      }),
    }) as unknown as typeof import('@/hooks/use-turnstile-token'),
)

vi.mock(import('@/components/shared/turnstile-field'), () => ({
  TurnstileField: () => <div data-testid='turnstile-field' />,
}))

vi.mock(import('@/lib/api/client/posts'), () => ({
  createLinkPost: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/email-verification-recovery-context'), async importOriginal => ({
  ...(await importOriginal()),
  useEmailVerificationRecovery: () => ({
    openEmailVerificationRecovery: mockOpenEmailVerificationRecovery,
  }),
}))

const mockCreateLinkPost = vi.mocked(createLinkPost)

describe('SubmitLinkForm', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockTurnstileReset.mockReset()
    mockCreateLinkPost.mockReset()
    mockOpenEmailVerificationRecovery.mockReset()
  })

  it('submits url and calls createLinkPost then router.push on success', async () => {
    mockCreateLinkPost.mockResolvedValue({
      post: { id: 'post-1', post_type: 'link', slug: 'my-link' },
    } as never)
    render(<SubmitLinkForm />)
    fireEvent.change(screen.getByRole('textbox', { name: /url/i }), {
      target: { value: 'https://example.com/article' },
    })
    fireEvent.submit(document.querySelector('[data-pw="submit-link-form"]')!)
    await waitFor(() => {
      expect(mockCreateLinkPost).toHaveBeenCalledWith({
        url: 'https://example.com/article',
        cf_turnstile_response: 'test-token',
      })
      expect(mockPush).toHaveBeenCalledWith('/link/my-link')
    })
  })

  it('shows error message when createLinkPost rejects', async () => {
    mockCreateLinkPost.mockRejectedValue(new Error('Server error'))
    render(<SubmitLinkForm />)
    fireEvent.change(screen.getByRole('textbox', { name: /url/i }), {
      target: { value: 'https://example.com/article' },
    })
    fireEvent.submit(document.querySelector('[data-pw="submit-link-form"]')!)
    await waitFor(() => {
      expect(document.querySelector('[data-pw="submit-link-error"]')).not.toBeNull()
      expect(document.querySelector('[data-pw="submit-link-error"]')?.textContent).toContain(
        'Server error',
      )
    })
    expect(mockTurnstileReset).toHaveBeenCalled()
  })

  it('button is disabled when url is empty', () => {
    render(<SubmitLinkForm />)
    const btn = document.querySelector('[data-pw="submit-link-button"]') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('opens email recovery and preserves the form for manual retry', async () => {
    mockCreateLinkPost.mockRejectedValue(
      Object.assign(new Error('Verify an email address'), {
        code: 'EMAIL_VERIFICATION_REQUIRED',
      }),
    )
    render(<SubmitLinkForm />)
    const urlInput = screen.getByRole('textbox', { name: /url/i })
    fireEvent.change(urlInput, { target: { value: 'https://example.com/article' } })
    fireEvent.submit(document.querySelector('[data-pw="submit-link-form"]')!)

    await waitFor(() => expect(mockOpenEmailVerificationRecovery).toHaveBeenCalledOnce())
    expect(urlInput).toHaveValue('https://example.com/article')
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockTurnstileReset).toHaveBeenCalled()
  })
})
