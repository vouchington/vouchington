import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { submitCopyrightGuestFiling } from '@/lib/api/client/copyright-guest'
import onError, { onSuccess } from '@/lib/on-error'

const { turnstileReset } = vi.hoisted(() => ({
  turnstileReset: vi.fn<() => void>(),
}))

vi.mock(import('next/navigation'), () => navMockModule)

vi.mock(import('@/hooks/use-turnstile-token'), () => ({
  useTurnstileToken: () => ({
    token: 'turnstile-token',
    reset: turnstileReset,
    containerRef: vi.fn<(node: HTMLDivElement | null) => void>(),
    isError: false,
    alwaysApprove: true,
  }),
}))

vi.mock(import('@/components/shared/turnstile-field'), () => ({
  TurnstileField: () => null,
}))

vi.mock(import('@/lib/api/client/copyright-guest'), () => ({
  submitCopyrightGuestFiling: vi.fn<typeof submitCopyrightGuestFiling>(),
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<typeof onError>(),
  onSuccess: vi.fn<typeof onSuccess>(),
}))

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        value,
        onValueChange,
        children,
      }: {
        value: string
        onValueChange: (value: string) => void
        children: ReactNode
      }) => (
        <select
          id='guest-filing-kind'
          value={value}
          onChange={event => onValueChange(event.target.value)}
        >
          {children}
        </select>
      ),
      SelectTrigger: () => null,
      SelectValue: () => null,
      SelectContent: ({ children }: { children: ReactNode }) => children,
      SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
        <option value={value}>{children}</option>
      ),
    }) as unknown as typeof import('@/components/ui/select'),
)

import { CopyrightGuestFilingForm } from './copyright-guest-filing-form'

const mockNav = createNavMock()
const mockSubmit = vi.mocked(submitCopyrightGuestFiling)
const noticeId = '00000000-0000-7000-8000-000000000830'

describe('CopyrightGuestFilingForm', () => {
  beforeEach(() => {
    mockNav.reset()
    mockSubmit.mockReset()
    turnstileReset.mockReset()
    mockSubmit.mockResolvedValue({
      copyright_submission: {
        id: '00000000-0000-7000-8000-000000000832',
        kind: 'supplement',
        received_at: '2026-07-02T15:00:00.000Z',
      },
    })
  })

  it('submits a correction with the case token', async () => {
    render(<CopyrightGuestFilingForm noticeId={noticeId} />)
    fireEvent.change(screen.getByLabelText('Case access token'), {
      target: { value: 'fixture-guest-capability-token' },
    })
    fireEvent.change(screen.getByLabelText('Statement'), {
      target: { value: 'Corrected work description.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit filing' }))
    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledWith({
        noticeId,
        token: 'fixture-guest-capability-token',
        kind: 'supplement',
        statement: 'Corrected work description.',
        cf_turnstile_response: 'turnstile-token',
      })
    })
    expect(turnstileReset).toHaveBeenCalledOnce()
  })

  it('submits a withdrawal when that filing kind is selected', async () => {
    render(<CopyrightGuestFilingForm noticeId={noticeId} />)
    fireEvent.change(screen.getByLabelText('Case access token'), {
      target: { value: 'fixture-guest-capability-token' },
    })
    fireEvent.change(screen.getByLabelText('Filing'), { target: { value: 'withdrawal' } })
    fireEvent.change(screen.getByLabelText('Statement'), {
      target: { value: 'Withdraw this notice.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit filing' }))
    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledWith({
        noticeId,
        token: 'fixture-guest-capability-token',
        kind: 'withdrawal',
        statement: 'Withdraw this notice.',
        cf_turnstile_response: 'turnstile-token',
      })
    })
  })

  it('reports a filing failure without clearing the statement', async () => {
    mockSubmit.mockRejectedValueOnce(new Error('network'))
    render(<CopyrightGuestFilingForm noticeId={noticeId} />)
    fireEvent.change(screen.getByLabelText('Case access token'), {
      target: { value: 'fixture-guest-capability-token' },
    })
    fireEvent.change(screen.getByLabelText('Statement'), {
      target: { value: 'Corrected statement.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit filing' }))
    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(expect.any(Error), { fallback: 'Could not file' })
    })
    expect(screen.getByLabelText('Statement')).toHaveValue('Corrected statement.')
  })
})
