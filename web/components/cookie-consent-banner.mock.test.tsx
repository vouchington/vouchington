import { describe, expect, it, beforeEach, vi } from 'vitest'
import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CookieConsentBanner } from './cookie-consent-banner'

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

describe('cookie-consent-banner', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.defineProperty(window.navigator, 'globalPrivacyControl', {
      configurable: true,
      value: false,
    })
  })

  describe('CookieConsentBanner', () => {
    it('shows banner when no consent stored', async () => {
      render(<CookieConsentBanner />)
      await waitFor(() => {
        expect(screen.getByRole('region', { name: /cookie consent/i })).toBeInTheDocument()
      })
      expect(screen.getByRole('button', { name: /accept all/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /essential only/i })).toBeInTheDocument()
    })

    it('stores essential consent and hides the banner when Global Privacy Control is enabled', () => {
      Object.defineProperty(navigator, 'globalPrivacyControl', {
        configurable: true,
        value: true,
      })
      const handler = vi.fn<VitestLooseMock>()
      window.addEventListener('cookie-consent-changed', handler)

      render(<CookieConsentBanner />)

      expect(localStorage.getItem('cookie-consent')).toBe('essential')
      expect(screen.queryByRole('region', { name: /cookie consent/i })).not.toBeInTheDocument()
      expect(handler).toHaveBeenCalledTimes(1)
      window.removeEventListener('cookie-consent-changed', handler)
    })

    it('hides banner when consent is "all"', () => {
      localStorage.setItem('cookie-consent', 'all')
      render(<CookieConsentBanner />)
      expect(screen.queryByRole('region', { name: /cookie consent/i })).not.toBeInTheDocument()
    })

    it('hides banner when consent is "essential"', () => {
      localStorage.setItem('cookie-consent', 'essential')
      render(<CookieConsentBanner />)
      expect(screen.queryByRole('region', { name: /cookie consent/i })).not.toBeInTheDocument()
    })

    it('stores "all" and hides banner on Accept All click', async () => {
      const handler = vi.fn<VitestLooseMock>()
      window.addEventListener('cookie-consent-changed', handler)

      render(<CookieConsentBanner />)
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /accept all/i })).toBeInTheDocument()
      })
      fireEvent.click(screen.getByRole('button', { name: /accept all/i }))

      expect(localStorage.getItem('cookie-consent')).toBe('all')
      expect(screen.queryByRole('region', { name: /cookie consent/i })).not.toBeInTheDocument()
      expect(handler).toHaveBeenCalledTimes(1)

      window.removeEventListener('cookie-consent-changed', handler)
    })

    it('stores "essential" and hides banner on Essential Only click', async () => {
      const handler = vi.fn<VitestLooseMock>()
      window.addEventListener('cookie-consent-changed', handler)

      render(<CookieConsentBanner />)
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /essential only/i })).toBeInTheDocument()
      })
      fireEvent.click(screen.getByRole('button', { name: /essential only/i }))

      expect(localStorage.getItem('cookie-consent')).toBe('essential')
      expect(screen.queryByRole('region', { name: /cookie consent/i })).not.toBeInTheDocument()
      expect(handler).toHaveBeenCalledTimes(1)

      window.removeEventListener('cookie-consent-changed', handler)
    })

    it('shows banner when stored value is invalid', async () => {
      localStorage.setItem('cookie-consent', 'invalid-value')
      render(<CookieConsentBanner />)
      await waitFor(() => {
        expect(screen.getByRole('region', { name: /cookie consent/i })).toBeInTheDocument()
      })
    })

    it('shows a link to the cookie policy', async () => {
      render(<CookieConsentBanner />)
      await waitFor(() => {
        expect(screen.getByRole('region', { name: /cookie consent/i })).toBeInTheDocument()
      })
      const link = screen.getByRole('link', { name: /cookie policy/i })
      expect(link).toHaveAttribute('href', '/article/cookie-policy')
    })
  })
})
