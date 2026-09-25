import type { ReactNode } from 'react'

import { describe, it, expect, vi, beforeEach } from 'vitest'

import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { IdentityVerificationContent } from '../identity-verification-content'

import { ApiError } from '@/lib/api/error'

const { mockOnError, mockOnSuccess } = vi.hoisted(() => ({
  mockOnError: vi.fn<VitestLooseMock>(),
  mockOnSuccess: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/identity-verification'), () => ({
  startMyIdentityVerificationCheckout: vi.fn<VitestLooseMock>(),
  updateMyIdentityVerificationDisplayPreferences: vi.fn<VitestLooseMock>(),
  getMyIdentityVerificationSessionUrl: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
  onSuccess: mockOnSuccess,
}))

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        onValueChange,
        value,
        children,
      }: {
        children: ReactNode
        onValueChange?: (value: string) => void
        value?: string
      }) => (
        <select
          aria-label='name-display-select'
          data-testid='name-display-select'
          value={value}
          onChange={event => onValueChange?.(event.target.value)}
        >
          {children}
        </select>
      ),
      SelectContent: ({ children }: { children: ReactNode }) => children,
      SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
        <option value={value}>{children}</option>
      ),
      SelectTrigger: () => null,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

import { startMyIdentityVerificationCheckout } from '@/lib/api/client/identity-verification'

const mockStart = vi.mocked(startMyIdentityVerificationCheckout)

const defaultProps = {
  verifiedBadgeVisible: true,
  publicVerifiedNameDisplay: 'hidden' as const,
  verificationFee: '$5.00',
}

describe('IdentityVerificationContent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOnError.mockReturnValue('Failed to update display preferences.')
    // Mock window.location.href assignment
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { href: '' },
    })
  })

  describe('unverified status', () => {
    it('renders the Get ID Verified heading', () => {
      render(
        <IdentityVerificationContent
          {...defaultProps}
          verificationStatus='unverified'
        />,
      )
      expect(screen.getByRole('heading', { name: /get id verified/i })).toBeDefined()
    })

    it('renders the start verification button', () => {
      render(
        <IdentityVerificationContent
          {...defaultProps}
          verificationStatus='unverified'
        />,
      )
      expect(screen.getByRole('button', { name: /verify my identity/i })).toBeDefined()
    })

    it('shows verification fee in the description', () => {
      render(
        <IdentityVerificationContent
          {...defaultProps}
          verificationStatus='unverified'
          verificationFee='$9.99'
        />,
      )
      expect(screen.getByText(/\$9\.99/)).toBeDefined()
    })

    it('redirects to checkout URL on start button click', async () => {
      mockStart.mockResolvedValue({ url: 'https://checkout.stripe.com/pay/cs_test' })
      render(
        <IdentityVerificationContent
          {...defaultProps}
          verificationStatus='unverified'
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: /verify my identity/i }))
      await waitFor(() => {
        expect(window.location.href).toBe('https://checkout.stripe.com/pay/cs_test')
      })
    })

    it('shows ApiError message on checkout failure', async () => {
      mockStart.mockRejectedValue(
        new ApiError('Not eligible', 422, { code: 'UNPROCESSABLE', message: 'Not eligible' }),
      )
      render(
        <IdentityVerificationContent
          {...defaultProps}
          verificationStatus='unverified'
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: /verify my identity/i }))
      await waitFor(() => {
        expect(screen.getByText('Not eligible')).toBeDefined()
      })
    })

    it('shows fallback error message on unknown error', async () => {
      mockStart.mockRejectedValue(new Error('network'))
      render(
        <IdentityVerificationContent
          {...defaultProps}
          verificationStatus='unverified'
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: /verify my identity/i }))
      await waitFor(() => {
        expect(screen.getByText('Failed to start verification.')).toBeDefined()
      })
    })
  })

  describe('payment_pending status', () => {
    it('renders the Payment In Progress heading', () => {
      render(
        <IdentityVerificationContent
          {...defaultProps}
          verificationStatus='payment_pending'
        />,
      )
      expect(screen.getByRole('heading', { name: /payment in progress/i })).toBeDefined()
    })

    it('renders no action button', () => {
      render(
        <IdentityVerificationContent
          {...defaultProps}
          verificationStatus='payment_pending'
        />,
      )
      expect(screen.queryByRole('button')).toBeNull()
    })
  })

  describe('identity_pending status', () => {
    it('renders the Verification In Progress heading', () => {
      render(
        <IdentityVerificationContent
          {...defaultProps}
          verificationStatus='identity_pending'
        />,
      )
      expect(screen.getByRole('heading', { name: /verification in progress/i })).toBeDefined()
    })

    it('renders a Continue Verification button', () => {
      render(
        <IdentityVerificationContent
          {...defaultProps}
          verificationStatus='identity_pending'
        />,
      )
      expect(screen.getByRole('button', { name: /continue verification/i })).toBeDefined()
    })
  })
})
