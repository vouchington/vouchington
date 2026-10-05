import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { createCopyrightEuNotice } from '@/lib/api/client/copyright-notices'
import { makeCopyrightEuNoticeResponse } from '@/test-helpers/api-responses/copyright'
import { CopyrightEuNoticeForm } from './copyright-eu-notice-form'

const { currentUser } = vi.hoisted(() => ({ currentUser: vi.fn<VitestLooseMock>() }))
vi.mock(import('next/navigation'), () => navMockModule)
vi.mock(import('@/lib/auth/context'), () => ({
  useAuth: () => ({ currentUser: currentUser(), isAuthenticated: Boolean(currentUser()) }),
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
  createCopyrightEuNotice: vi.fn<typeof createCopyrightEuNotice>(),
}))

configure({ testIdAttribute: 'data-pw' })
const mockCreate = vi.mocked(createCopyrightEuNotice)
const navigation = createNavMock()
const noticeId = '019f0000-0000-7000-8000-00000000e001'

function fillForm() {
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Ada Claimant' } })
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: 'ada@example.test' },
  })
  fireEvent.change(screen.getByLabelText('Contact details'), { target: { value: '1 Main Street' } })
  fireEvent.change(screen.getByLabelText('Copyrighted work'), { target: { value: 'A photograph' } })
  fireEvent.change(screen.getByLabelText('Why this use infringes your rights'), {
    target: { value: 'The image reproduces my photograph.' },
  })
  fireEvent.change(screen.getByLabelText('Exact URL of the material on Voucha'), {
    target: { value: 'https://voucha.ai/discussion/example' },
  })
  fireEvent.click(screen.getByLabelText(/I believe in good faith/))
  fireEvent.click(screen.getByRole('button', { name: 'Submit EU notice' }))
}

describe('CopyrightEuNoticeForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    navigation.reset()
    currentUser.mockReturnValue(null)
  })

  it('submits the EU fields and shows a guest the emailed decision and reply path', async () => {
    mockCreate.mockResolvedValue(makeCopyrightEuNoticeResponse())
    render(<CopyrightEuNoticeForm />)
    expect(screen.queryByRole('note')).toBeNull()
    expect(screen.getByRole('button', { name: 'Submit EU notice' })).toBeDisabled()
    fillForm()
    expect(mockCreate).toHaveBeenCalledWith({
      notifier_name: 'Ada Claimant',
      notifier_email: 'ada@example.test',
      contact: '1 Main Street',
      content_description: 'A photograph',
      grounds: 'The image reproduces my photograph.',
      hosted_use_url: 'https://voucha.ai/discussion/example',
      has_good_faith_statement: true,
      cf_turnstile_response: 'turnstile-token',
    })
    const receipt = await screen.findByTestId('copyright-eu-guest-receipt')
    expect(receipt).toHaveTextContent(noticeId)
    expect(receipt).toHaveTextContent('ada@example.test')
    expect(receipt).toHaveTextContent(/reply to the decision email/i)
    expect(navigation.push).not.toHaveBeenCalled()
  })

  it('opens the case page for a signed-in notifier', async () => {
    currentUser.mockReturnValue({ id: 'notifier', roles: [] })
    mockCreate.mockResolvedValue(makeCopyrightEuNoticeResponse())
    render(<CopyrightEuNoticeForm />)
    fillForm()
    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith(`/copyright/notices/${noticeId}`),
    )
    expect(screen.queryByTestId('copyright-eu-guest-receipt')).toBeNull()
  })

  it('keeps a duplicate guest in the receipt without claiming a second case', async () => {
    mockCreate.mockResolvedValue(makeCopyrightEuNoticeResponse(true))
    render(<CopyrightEuNoticeForm />)
    fillForm()
    expect(await screen.findByText(/we did not open a second case/i)).toBeInTheDocument()
  })
})
