import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { createCopyrightNotice } from '@/lib/api/client/copyright-notices'
import { resolveCopyrightNoticeTargets } from '@/lib/api/client/copyright-notice-targets'
import { CopyrightNoticeForm } from './copyright-notice-form'

configure({ testIdAttribute: 'data-pw' })

vi.mock(import('@/lib/auth/context'), () => ({
  useAuth: () => ({
    currentUser: {
      id: 'claimant-user',
      username: 'current-claimant',
      roles: [],
      account_type: null,
    },
    isAuthenticated: true,
  }),
}))

vi.mock(import('next/navigation'), () => navMockModule)

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

vi.mock(import('@/lib/api/client/copyright-notice-targets'), async importOriginal => ({
  ...(await importOriginal()),
  resolveCopyrightNoticeTargets: vi.fn<typeof resolveCopyrightNoticeTargets>(),
}))

const mockCreateNotice = vi.mocked(createCopyrightNotice)
const mockResolveTargets = vi.mocked(resolveCopyrightNoticeTargets)
const mockNav = createNavMock()

describe('CopyrightNoticeForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
  })

  it('discloses the current public profile before submission', () => {
    render(<CopyrightNoticeForm />)

    expect(screen.getByRole('link', { name: 'profile' })).toHaveAttribute(
      'href',
      '/user/current-claimant',
    )
    expect(screen.getByText(/public profile to signed-in members/i)).toBeInTheDocument()
    expect(
      screen.getByText(/legal name, contact details, and signature stay private/i),
    ).toBeInTheDocument()
  })

  it('warns about §512(f) misrepresentation liability above the submit button', () => {
    render(<CopyrightNoticeForm />)

    const warning = screen.getByRole('note')
    expect(warning.textContent).toMatch(/512\(f\).*that material is infringing.*attorneys' fees/i)
    expect(warning.textContent).toMatch(/fair use/i)
    expect(screen.getByRole('link', { name: 'How copyright complaints work' })).toHaveAttribute(
      'href',
      '/article/copyright-complaints',
    )
    expect(
      warning.compareDocumentPosition(screen.getByRole('button', { name: 'Submit notice' })),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('resolves a hosted-use URL and submits only selected images without exposing raw IDs', async () => {
    mockResolveTargets.mockResolvedValue([
      {
        surface: 'post-image',
        post_id: '019f0000-0000-7000-8000-000000000001',
        image_id: '019f0000-0000-7000-8000-000000000002',
        target_url: 'https://voucha.ai/discussion/hosted-material',
        order_index: 0,
        caption: 'Claimed image',
      },
      {
        surface: 'post-image',
        post_id: '019f0000-0000-7000-8000-000000000001',
        image_id: '019f0000-0000-7000-8000-000000000003',
        target_url: 'https://voucha.ai/discussion/hosted-material',
        order_index: 1,
        caption: '',
      },
    ])
    mockCreateNotice.mockResolvedValue({
      copyright_notice: { id: '019f0000-0000-7000-8000-000000000004' },
      is_duplicate: false,
    })
    render(<CopyrightNoticeForm />)

    expect(screen.queryByLabelText('Hosted post ID')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Hosted image ID')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Hosted use URL'), {
      target: { value: 'https://voucha.ai/discussion/hosted-material' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Find hosted material' }))
    await waitFor(() => {
      expect(mockResolveTargets).toHaveBeenCalledWith(
        'https://voucha.ai/discussion/hosted-material',
      )
    })
    fireEvent.click(screen.getByLabelText('Hosted image 2: Image 2'))
    fireEvent.change(screen.getByLabelText('Full legal name'), { target: { value: 'Claimant' } })
    fireEvent.change(screen.getByLabelText('Mailing address'), { target: { value: '1 Main St' } })
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'tests+51c2846f@voucha.ai' },
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

    await waitFor(() => {
      expect(mockCreateNotice).toHaveBeenCalledWith({
        claimant_display_name: 'Claimant',
        claimant_contact: '1 Main St',
        claimant_email: 'tests+51c2846f@voucha.ai',
        work_description: 'Claimed photograph',
        electronic_signature: 'Claimant',
        has_good_faith_belief: true,
        has_accuracy_authority_under_penalty_of_perjury: true,
        targets: [
          {
            surface: 'post-image',
            post_id: '019f0000-0000-7000-8000-000000000001',
            image_id: '019f0000-0000-7000-8000-000000000003',
            target_url: 'https://voucha.ai/discussion/hosted-material',
          },
        ],
        cf_turnstile_response: 'turnstile-token',
      })
    })
    await waitFor(() => expect(mockNav.push).toHaveBeenCalledWith('/copyright/notices'))
    expect(screen.queryByTestId('copyright-guest-receipt')).not.toBeInTheDocument()
  })

  it('resets captcha after a failed notice submission', async () => {
    mockResolveTargets.mockResolvedValue([
      {
        surface: 'post-image',
        post_id: '019f0000-0000-7000-8000-000000000001',
        image_id: '019f0000-0000-7000-8000-000000000002',
        target_url: 'https://voucha.ai/discussion/hosted-material',
        order_index: 0,
        caption: 'Claimed image',
      },
    ])
    mockCreateNotice.mockRejectedValue(new Error('network'))
    render(<CopyrightNoticeForm />)
    fireEvent.change(screen.getByLabelText('Hosted use URL'), {
      target: { value: 'https://voucha.ai/discussion/hosted-material' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Find hosted material' }))
    expect(await screen.findByLabelText('Hosted image 1: Claimed image')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Hosted image 1: Claimed image'))
    fireEvent.change(screen.getByLabelText('Full legal name'), { target: { value: 'Claimant' } })
    fireEvent.change(screen.getByLabelText('Mailing address'), { target: { value: '1 Main St' } })
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'tests+51c2846f@voucha.ai' },
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
    await waitFor(() => expect(mockCreateNotice).toHaveBeenCalled())
  })
})
