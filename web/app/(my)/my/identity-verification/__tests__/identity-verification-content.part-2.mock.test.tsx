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

import {
  startMyIdentityVerificationCheckout,
  updateMyIdentityVerificationDisplayPreferences,
} from '@/lib/api/client/identity-verification'

const mockStart = vi.mocked(startMyIdentityVerificationCheckout)

const mockUpdatePrefs = vi.mocked(updateMyIdentityVerificationDisplayPreferences)

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

  describe('verified status', () => {
    it('renders the Verified heading', () => {
      render(
        <IdentityVerificationContent
          {...defaultProps}
          verificationStatus='verified'
        />,
      )
      expect(screen.getByRole('heading', { name: /^verified$/i })).toBeDefined()
    })

    it('renders the save preferences button', () => {
      render(
        <IdentityVerificationContent
          {...defaultProps}
          verificationStatus='verified'
        />,
      )
      expect(screen.getByRole('button', { name: /save preferences/i })).toBeDefined()
    })

    it('calls updateMyIdentityVerificationDisplayPreferences on save', async () => {
      mockUpdatePrefs.mockResolvedValue(undefined as never)
      render(
        <IdentityVerificationContent
          {...defaultProps}
          verificationStatus='verified'
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: /save preferences/i }))
      await waitFor(() => {
        expect(mockUpdatePrefs).toHaveBeenCalledWith({
          verified_badge_visible: true,
          public_verified_name_display: 'hidden',
        })
      })
    })

    it('shows success message after saving', async () => {
      mockUpdatePrefs.mockResolvedValue(undefined as never)
      render(
        <IdentityVerificationContent
          {...defaultProps}
          verificationStatus='verified'
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: /save preferences/i }))
      await waitFor(() => {
        expect(screen.getByText('Display preferences saved.')).toBeDefined()
      })
      expect(mockOnSuccess).toHaveBeenCalledWith('Display preferences saved.')
    })

    it('shows ApiError message on save failure', async () => {
      mockOnError.mockReturnValue('Forbidden')
      mockUpdatePrefs.mockRejectedValue(
        new ApiError('Forbidden', 403, { code: 'FORBIDDEN', message: 'Forbidden' }),
      )
      render(
        <IdentityVerificationContent
          {...defaultProps}
          verificationStatus='verified'
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: /save preferences/i }))
      await waitFor(() => {
        expect(screen.getByText('Forbidden')).toBeDefined()
      })
      expect(mockOnError).toHaveBeenCalledWith(expect.any(ApiError), {
        fallback: 'Failed to update display preferences.',
        tags: { form: 'identity-verification-display-preferences' },
      })
    })
  })

  describe('failed status', () => {
    it('renders the Verification Failed heading', () => {
      render(
        <IdentityVerificationContent
          {...defaultProps}
          verificationStatus='failed'
        />,
      )
      expect(screen.getByRole('heading', { name: /verification failed/i })).toBeDefined()
    })

    it('renders the Try Again button', () => {
      render(
        <IdentityVerificationContent
          {...defaultProps}
          verificationStatus='failed'
        />,
      )
      expect(screen.getByRole('button', { name: /try again/i })).toBeDefined()
    })
  })

  describe('duplicate_id status', () => {
    it('renders the ID Already in Use heading', () => {
      render(
        <IdentityVerificationContent
          {...defaultProps}
          verificationStatus='duplicate_id'
        />,
      )
      expect(screen.getByRole('heading', { name: /id already in use/i })).toBeDefined()
    })

    it('renders a Contact Support link', () => {
      render(
        <IdentityVerificationContent
          {...defaultProps}
          verificationStatus='duplicate_id'
        />,
      )
      const link = screen.getByRole('link', { name: /contact support/i })
      expect(link.getAttribute('href')).toBe('mailto:support@voucha.ai')
    })

    it('renders no action button (contact support is a link)', () => {
      render(
        <IdentityVerificationContent
          {...defaultProps}
          verificationStatus='duplicate_id'
        />,
      )
      expect(screen.queryByRole('button')).toBeNull()
    })
  })
})
