import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock(import('@/lib/api/client'), () => ({
  deleteMyEmailAddress: vi.fn<VitestLooseMock>(),
  requestMyEmailAddressVerification: vi.fn<VitestLooseMock>(),
  setPrimaryMyEmailAddress: vi.fn<VitestLooseMock>(),
  verifyMyEmailAddress: vi.fn<VitestLooseMock>(),
}))

const { toastMock } = vi.hoisted(() => {
  const mock = Object.assign(vi.fn<VitestLooseMock>(), {
    error: vi.fn<VitestLooseMock>(),
    success: vi.fn<VitestLooseMock>(),
    info: vi.fn<VitestLooseMock>(),
  })
  return { toastMock: mock }
})

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: toastMock,
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/on-error'), () => ({
  default: (err: unknown, options: { fallback: string }) => {
    toastMock.error(options.fallback)
    return options.fallback
  },
  onSuccess: (message: string) => {
    toastMock.success(message)
  },
}))

import { EmailManager } from '../email-manager'
import {
  deleteMyEmailAddress,
  requestMyEmailAddressVerification,
  setPrimaryMyEmailAddress,
  verifyMyEmailAddress,
} from '@/lib/api/client'
import type { EmailAddress } from '@/types/user'

const mockDelete = vi.mocked(deleteMyEmailAddress)
const mockRequest = vi.mocked(requestMyEmailAddressVerification)
const mockSetPrimary = vi.mocked(setPrimaryMyEmailAddress)
const mockVerify = vi.mocked(verifyMyEmailAddress)

function makeEmail(addr: string, isPrimary = false): EmailAddress {
  return {
    email_address: addr,
    is_primary: isPrimary,
    verified_at: '2024-01-01T00:00:00Z',
    created_at: '2024-01-01T00:00:00Z',
  } as EmailAddress
}

function makeEmailPage(results: EmailAddress[]) {
  return {
    results,
    page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
  }
}

describe('EmailManager error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports request-verification failures via onError fallback', async () => {
    mockRequest.mockRejectedValueOnce(new Error('Send failed'))

    render(<EmailManager initialEmailAddresses={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /add email address/i }))
    const input = screen.getByLabelText('New email address') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'tests+new@voucha.ai' } })
    const sendButtons = screen.getAllByRole('button')
    const sendBtn = sendButtons.find(btn => btn.getAttribute('type') === 'submit')
    fireEvent.click(sendBtn!)

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to send verification code')
    })
  })

  it('reports verify failures via onError fallback', async () => {
    mockRequest.mockResolvedValueOnce({ email_address: 'tests+normalized@voucha.ai' })
    mockVerify.mockRejectedValueOnce(new Error('Invalid code'))

    render(<EmailManager initialEmailAddresses={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /add email address/i }))
    const input = screen.getByLabelText('New email address') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'tests+new@voucha.ai' } })
    const sendButtons = screen.getAllByRole('button')
    const sendBtn = sendButtons.find(btn => btn.getAttribute('type') === 'submit')
    fireEvent.click(sendBtn!)

    // Wait for the verification step to render, then type a full OTP value to trigger
    // autosubmit (the OTP onChange invokes submitVerify when length === 8).
    const otpInput = (await screen.findByLabelText(/verification code/i)) as HTMLInputElement
    fireEvent.input(otpInput, { target: { value: '12345678' } })

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Invalid or expired verification code')
    })
  })

  it('reports set-primary failures via onError fallback', async () => {
    mockSetPrimary.mockRejectedValueOnce(new Error('Set primary failed'))

    render(
      <EmailManager
        initialEmailAddresses={[
          makeEmail('tests+a@voucha.ai', true),
          makeEmail('tests+b@voucha.ai'),
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /set primary/i }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to update primary email')
    })
  })

  it('reports remove failures via onError fallback', async () => {
    mockDelete.mockRejectedValueOnce(new Error('Delete failed'))

    render(<EmailManager initialEmailAddresses={[makeEmail('tests+a@voucha.ai')]} />)
    fireEvent.click(screen.getByRole('button', { name: /remove/i }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to remove email address')
    })
  })

  it('emits onSuccess on successful verify', async () => {
    mockRequest.mockResolvedValueOnce({ email_address: 'tests+normalized@voucha.ai' })
    mockVerify.mockResolvedValueOnce(
      makeEmailPage([makeEmail('tests+new@voucha.ai', true)]) as never,
    )

    render(<EmailManager initialEmailAddresses={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /add email address/i }))
    const input = screen.getByLabelText('New email address') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'tests+new@voucha.ai' } })
    const sendButtons = screen.getAllByRole('button')
    const sendBtn = sendButtons.find(btn => btn.getAttribute('type') === 'submit')
    fireEvent.click(sendBtn!)

    const otpInput = (await screen.findByLabelText(/verification code/i)) as HTMLInputElement
    fireEvent.input(otpInput, { target: { value: '12345678' } })

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith('Email verified')
    })
  })

  it('emits onSuccess on successful set-primary', async () => {
    mockSetPrimary.mockResolvedValueOnce(
      makeEmailPage([
        makeEmail('tests+a@voucha.ai'),
        makeEmail('tests+b@voucha.ai', true),
      ]) as never,
    )

    render(
      <EmailManager
        initialEmailAddresses={[
          makeEmail('tests+a@voucha.ai', true),
          makeEmail('tests+b@voucha.ai'),
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /set primary/i }))

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith('Primary email updated')
    })
  })

  it('emits onSuccess on successful remove', async () => {
    mockDelete.mockResolvedValueOnce(undefined as never)

    render(<EmailManager initialEmailAddresses={[makeEmail('tests+a@voucha.ai')]} />)
    fireEvent.click(screen.getByRole('button', { name: /remove/i }))

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith('Email removed')
    })
  })
})
