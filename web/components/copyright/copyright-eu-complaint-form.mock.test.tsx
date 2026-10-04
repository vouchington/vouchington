import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { createCopyrightEuRedress } from '@/lib/api/client/copyright-notices'
import { makeCopyrightEuRedressResponse } from '@/test-helpers/api-responses/copyright-eu'

const { reset, token } = vi.hoisted(() => ({
  reset: vi.fn<() => void>(),
  token: { value: 'turnstile-token' as string | null },
}))
vi.mock(import('next/navigation'), () => navMockModule)
vi.mock(import('@/hooks/use-turnstile-token'), () => ({
  useTurnstileToken: () => ({
    token: token.value,
    reset,
    containerRef: vi.fn<(node: HTMLDivElement | null) => void>(),
    isError: false,
    alwaysApprove: true,
  }),
}))
vi.mock(import('@/components/shared/turnstile-field'), () => ({ TurnstileField: () => null }))
vi.mock(import('@/lib/api/client/copyright-notices'), () => ({
  createCopyrightEuRedress: vi.fn<typeof createCopyrightEuRedress>(),
}))
import { CopyrightEuComplaintForm } from './copyright-eu-complaint-form'

const nav = createNavMock()
const noticeId = '019f0000-0000-7000-8000-000000000001'
function submit() {
  fireEvent.change(screen.getByLabelText('Why should this decision be changed?'), {
    target: { value: '  I have permission to use this photograph.  ' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Submit complaint' }))
}

describe('CopyrightEuComplaintForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    nav.reset()
    token.value = 'turnstile-token'
    vi.mocked(createCopyrightEuRedress).mockResolvedValue(makeCopyrightEuRedressResponse())
  })
  it.each([false, true])(
    'submits and locks a received complaint (duplicate: %s)',
    async isDuplicate => {
      vi.mocked(createCopyrightEuRedress).mockResolvedValue(
        makeCopyrightEuRedressResponse(isDuplicate),
      )
      render(<CopyrightEuComplaintForm noticeId={noticeId} />)
      submit()
      await waitFor(() => expect(nav.push).toHaveBeenCalledWith(`/copyright/notices/${noticeId}`))
      expect(createCopyrightEuRedress).toHaveBeenCalledWith(noticeId, {
        explanation: 'I have permission to use this photograph.',
        cf_turnstile_response: 'turnstile-token',
      })
      expect(screen.getByRole('button', { name: 'Submit complaint' })).toBeDisabled()
      fireEvent.click(screen.getByRole('button', { name: 'Submit complaint' }))
      expect(createCopyrightEuRedress).toHaveBeenCalledTimes(1)
      expect(reset).toHaveBeenCalled()
    },
  )
  it('preserves the explanation and permits retry after failure', async () => {
    vi.mocked(createCopyrightEuRedress).mockRejectedValueOnce(new Error('network'))
    render(<CopyrightEuComplaintForm noticeId={noticeId} />)
    submit()
    await waitFor(() => expect(reset).toHaveBeenCalled())
    expect(screen.getByLabelText('Why should this decision be changed?')).toHaveValue(
      '  I have permission to use this photograph.  ',
    )
    expect(screen.getByRole('button', { name: 'Submit complaint' })).toBeEnabled()
    expect(nav.push).not.toHaveBeenCalled()
  })
  it('requires CAPTCHA and an explanation without US declarations', () => {
    token.value = null
    render(<CopyrightEuComplaintForm noticeId={noticeId} />)
    expect(screen.getByRole('button', { name: 'Submit complaint' })).toBeDisabled()
    expect(
      screen.queryByText(/512\(f\)|penalty of perjury|consent to jurisdiction/i),
    ).not.toBeInTheDocument()
    expect(createCopyrightEuRedress).not.toHaveBeenCalled()
  })
})
