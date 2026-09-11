import type { ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ContributionGatedCta } from './contribution-gated-cta'

const { mockOpenEmailVerificationRecovery, mockRefresh } = vi.hoisted(() => ({
  mockOpenEmailVerificationRecovery: vi.fn<VitestLooseMock>(),
  mockRefresh: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: mockRefresh }),
    }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/email-verification-recovery-context'), () => ({
  useEmailVerificationRecovery: () => ({
    openEmailVerificationRecovery: mockOpenEmailVerificationRecovery,
  }),
}))

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        ...props
      }: {
        children: ReactNode
        href: string
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

describe('ContributionGatedCta', () => {
  describe('account_too_new', () => {
    it('renders upgrade CTA with View plans button linking to /plans', () => {
      render(
        <ContributionGatedCta
          status={{ allowed: false, reason: 'account_too_new' }}
          actionNoun='start a discussion'
        />,
      )
      expect(screen.getByText('Almost there — just a short wait')).toBeInTheDocument()
      const primaryBtn = screen.getByRole('link', { name: 'View plans' })
      expect(primaryBtn).toBeInTheDocument()
      expect(primaryBtn.getAttribute('href')).toBe('/plans')
      expect(primaryBtn.getAttribute('data-pw')).toBe('contribution-gated-cta-primary')
    })

    it('does not render a secondary link', () => {
      const { container } = render(
        <ContributionGatedCta status={{ allowed: false, reason: 'account_too_new' }} />,
      )
      expect(container.querySelector('[data-pw="contribution-gated-cta-secondary"]')).toBeNull()
      expect(screen.queryByText(/skip verification/i)).toBeNull()
    })

    it('carries data-pw on the root card', () => {
      const { container } = render(
        <ContributionGatedCta status={{ allowed: false, reason: 'account_too_new' }} />,
      )
      expect(container.querySelector('[data-pw="contribution-gated-cta"]')).not.toBeNull()
    })

    it('mentions the actionNoun in the description', () => {
      render(
        <ContributionGatedCta
          status={{ allowed: false, reason: 'account_too_new' }}
          actionNoun='write a review'
        />,
      )
      expect(screen.getByText(/write a review/)).toBeInTheDocument()
    })
  })

  describe('email_verification_required', () => {
    it('renders a verify email recovery button', () => {
      render(
        <ContributionGatedCta
          status={{ allowed: false, reason: 'email_verification_required' }}
          actionNoun='write a review'
        />,
      )
      expect(screen.getByText(/Verify your email to write a review/)).toBeInTheDocument()
      const primaryBtn = screen.getByRole('button', { name: 'Verify email' })
      expect(primaryBtn).toBeEnabled()
    })

    it('renders secondary plans link', () => {
      render(
        <ContributionGatedCta status={{ allowed: false, reason: 'email_verification_required' }} />,
      )
      const secondary = screen.getByText(/Or upgrade to skip verification/i)
      expect(secondary).toBeInTheDocument()
      const link = secondary.closest('a') ?? secondary
      expect((link as HTMLAnchorElement).getAttribute('href')).toBe('/plans')
      expect(secondary.closest('[data-pw="contribution-gated-cta-secondary"]')).not.toBeNull()
    })

    it('carries data-pw on the root card', () => {
      const { container } = render(
        <ContributionGatedCta status={{ allowed: false, reason: 'email_verification_required' }} />,
      )
      expect(container.querySelector('[data-pw="contribution-gated-cta"]')).not.toBeNull()
    })
  })

  describe('unknown / no reason', () => {
    it('renders generic fallback CTA linking to /plans', () => {
      render(<ContributionGatedCta status={{ allowed: false }} />)
      expect(screen.getByText(/You can't post right now/)).toBeInTheDocument()
      const primaryBtn = screen.getByRole('link', { name: 'View plans' })
      expect(primaryBtn.getAttribute('href')).toBe('/plans')
    })

    it('uses actionNoun in the fallback title', () => {
      render(
        <ContributionGatedCta
          status={{ allowed: false }}
          actionNoun='share a data point'
        />,
      )
      expect(screen.getByText(/You can't share a data point right now/)).toBeInTheDocument()
    })

    it('does not render a secondary link', () => {
      render(<ContributionGatedCta status={{ allowed: false }} />)
      expect(screen.queryByText(/skip verification/i)).toBeNull()
    })
  })

  describe('admission limit', () => {
    it('renders a rate limit message before generic account fallback', () => {
      render(
        <ContributionGatedCta
          status={{ allowed: true }}
          admission={{
            allowed: false,
            reason: 'type_limit',
            retry_after_seconds: 60,
          }}
          actionNoun='write a review'
        />,
      )

      expect(screen.getByText(/You can't write a review right now/)).toBeInTheDocument()
      expect(screen.getByText(/current contribution limit/)).toBeInTheDocument()
    })

    it('keeps account-age guidance when both account and action gates block', () => {
      render(
        <ContributionGatedCta
          status={{ allowed: false, reason: 'account_too_new' }}
          admission={{
            allowed: false,
            reason: 'type_limit',
            retry_after_seconds: 60,
          }}
          actionNoun='write a review'
        />,
      )

      expect(screen.getByText('Almost there — just a short wait')).toBeInTheDocument()
      expect(screen.queryByText(/current contribution limit/)).toBeNull()
    })
  })

  describe('default actionNoun', () => {
    it('defaults to "post" when no actionNoun provided', () => {
      render(<ContributionGatedCta status={{ allowed: false, reason: 'account_too_new' }} />)
      expect(screen.getByText(/before they can post\./)).toBeInTheDocument()
    })
  })
})
