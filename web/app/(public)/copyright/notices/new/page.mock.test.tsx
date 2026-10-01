import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { createCopyrightNotice } from '@/lib/api/client/copyright-notices'
import { resolveCopyrightNoticeTargets } from '@/lib/api/client/copyright-notice-targets'

const { mockGetCurrentUser, mockRedirect } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockRedirect: vi.fn<VitestLooseMock>(),
}))

// The real `requireCurrentUser` runs, so a gate on this page fails the test for the right reason.
vi.mock(import('@/lib/auth/get-current-user'), () => ({ getCurrentUser: mockGetCurrentUser }))
vi.mock(
  import('next/navigation'),
  () =>
    ({ ...navMockModule, redirect: mockRedirect }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/auth/context'), () => ({
  useAuth: () => ({ currentUser: null, isAuthenticated: false }),
}))
vi.mock(import('@/hooks/use-turnstile-token'), () => ({
  useTurnstileToken: () => ({
    token: 'turnstile-token',
    reset: vi.fn<() => void>(),
    containerRef: vi.fn<(node: HTMLDivElement | null) => void>(),
    isError: false,
    alwaysApprove: true,
  }),
}))
vi.mock(import('@/components/shared/turnstile-field'), () => ({ TurnstileField: () => null }))
vi.mock(import('@/lib/api/client/copyright-notices'), () => ({
  createCopyrightNotice: vi.fn<typeof createCopyrightNotice>(),
}))
vi.mock(import('@/lib/api/client/copyright-notice-targets'), () => ({
  resolveCopyrightNoticeTargets: vi.fn<typeof resolveCopyrightNoticeTargets>(),
}))

import NewCopyrightNoticePage from './page'

configure({ testIdAttribute: 'data-pw' })

const mockNav = createNavMock()
const noticeId = '019f0000-0000-7000-8000-000000000004'

async function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText('Hosted use URL'), {
    target: { value: 'https://voucha.ai/discussion/hosted-material' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Find hosted material' }))
  fireEvent.click(await screen.findByLabelText('Hosted image 1: Claimed image'))
  fireEvent.change(screen.getByLabelText('Full legal name'), { target: { value: 'Claimant' } })
  fireEvent.change(screen.getByLabelText('Mailing address'), { target: { value: '1 Main St' } })
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: 'tests+claimant@voucha.ai' },
  })
  fireEvent.change(screen.getByLabelText('Copyrighted work'), {
    target: { value: 'Claimed photograph' },
  })
  fireEvent.change(screen.getByLabelText('Electronic signature'), {
    target: { value: 'Claimant' },
  })
  fireEvent.click(screen.getByLabelText(/good-faith belief/i))
  fireEvent.click(screen.getByLabelText(/under penalty of perjury/i))
  fireEvent.click(screen.getByRole('button', { name: 'Submit notice' }))
}

describe('NewCopyrightNoticePage for a signed-out visitor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
    mockGetCurrentUser.mockResolvedValue(null)
    mockRedirect.mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })
    vi.mocked(resolveCopyrightNoticeTargets).mockResolvedValue([
      {
        post_id: '019f0000-0000-7000-8000-000000000001',
        image_id: '019f0000-0000-7000-8000-000000000002',
        target_url: 'https://voucha.ai/discussion/hosted-material',
        order_index: 0,
        caption: 'Claimed image',
      },
    ])
  })

  it('shows the form with the CAPTCHA, the statutory warning and the email path', async () => {
    render(await NewCopyrightNoticePage())

    expect(mockRedirect).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Copyright notice' })).toBeInTheDocument()
    expect(screen.getByTestId('copyright-notice-form')).toBeInTheDocument()
    expect(screen.getByRole('note').textContent).toMatch(/512\(f\)/)
    expect(screen.getByText(/without signing in/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'profile' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'designated agent' })).toHaveAttribute(
      'href',
      '/copyright/designated-agent',
    )
  })

  it('files a notice and explains how the case is tracked without sending the guest to a signed-in page', async () => {
    vi.mocked(createCopyrightNotice).mockResolvedValue({
      copyright_notice: { id: noticeId },
      is_duplicate: false,
    })
    render(await NewCopyrightNoticePage())

    await fillAndSubmit()

    expect(await screen.findByRole('heading', { name: 'Notice received' })).toBeInTheDocument()
    expect(createCopyrightNotice).toHaveBeenCalledWith(
      expect.objectContaining({
        claimant_email: 'tests+claimant@voucha.ai',
        cf_turnstile_response: 'turnstile-token',
      }),
    )
    const receipt = screen.getByTestId('copyright-guest-receipt')
    expect(receipt).toHaveTextContent(noticeId)
    expect(receipt).toHaveTextContent('tests+claimant@voucha.ai')
    expect(receipt).toHaveTextContent(/cannot follow this case online/i)
    expect(receipt).toHaveTextContent(`/copyright/notices/${noticeId}/guest`)
    expect(screen.queryByTestId('copyright-notice-form')).not.toBeInTheDocument()
    expect(mockNav.push).not.toHaveBeenCalled()
  })

  it('keeps the form and offers a retry when the submission fails', async () => {
    vi.mocked(createCopyrightNotice).mockRejectedValue(new Error('network'))
    render(await NewCopyrightNoticePage())

    await fillAndSubmit()

    await waitFor(() => expect(createCopyrightNotice).toHaveBeenCalled())
    expect(screen.getByTestId('copyright-notice-form')).toBeInTheDocument()
    expect(screen.queryByTestId('copyright-guest-receipt')).not.toBeInTheDocument()
  })
})
