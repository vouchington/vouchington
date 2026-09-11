'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { hasNavigatorGlobalPrivacyControl } from '@/lib/privacy/global-privacy-control'
import { useTranslations } from '@/lib/i18n/use-translations'

const VALID_CONSENT_VALUES = ['all', 'essential'] as const

function getStoredConsent(): string | null {
  try {
    return localStorage.getItem('cookie-consent')
  } catch {
    return null
  }
}

function setStoredConsent(value: string): void {
  try {
    localStorage.setItem('cookie-consent', value)
  } catch {
    // localStorage may be unavailable in private browsing or when storage is full
  }
}

export function CookieConsentBanner() {
  const t = useTranslations()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (hasNavigatorGlobalPrivacyControl()) {
      setStoredConsent('essential')
      window.dispatchEvent(new CustomEvent('cookie-consent-changed'))
      return
    }
    const stored = getStoredConsent()
    const isValid = VALID_CONSENT_VALUES.includes(stored as (typeof VALID_CONSENT_VALUES)[number])
    if (!isValid) {
      queueMicrotask(() => setVisible(true))
    }
  }, [])

  function handleAcceptAll() {
    setStoredConsent('all')
    setVisible(false)
    window.dispatchEvent(new CustomEvent('cookie-consent-changed'))
  }

  function handleEssentialOnly() {
    setStoredConsent('essential')
    setVisible(false)
    window.dispatchEvent(new CustomEvent('cookie-consent-changed'))
  }

  if (!visible) return null

  return (
    <section
      data-pw='cookie-consent-banner'
      className='fixed bottom-0 left-0 right-0 z-50 flex flex-col items-stretch justify-center gap-3 bg-background/95 px-4 py-4 shadow-lg backdrop-blur-sm sm:flex-row sm:items-center sm:gap-4'
      aria-label={t('extracted.components.cookieConsentBanner.cookieConsent_8d5e02d1')}
    >
      <p className='text-sm text-muted-foreground'>
        {t('extracted.components.cookieConsentBanner.weUseCookiesToImproveYour_2424df3b')}{' '}
        <Link
          href='/article/cookie-policy'
          prefetch={false}
          className='underline underline-offset-2 hover:text-foreground'
        >
          {t('extracted.components.cookieConsentBanner.cookiePolicy_ee290b3d')}
        </Link>
      </p>
      <div className='flex shrink-0 flex-col gap-2 sm:flex-row'>
        <Button
          size='touchSm'
          variant='outline'
          onClick={handleEssentialOnly}
          data-pw='cookie-consent-essential-only-button'
        >
          {t('extracted.components.cookieConsentBanner.essentialOnly_e8a3f2b5')}
        </Button>
        <Button
          size='touchSm'
          onClick={handleAcceptAll}
          data-pw='cookie-consent-accept-all-button'
        >
          {t('extracted.components.cookieConsentBanner.acceptAll_3e86b172')}
        </Button>
      </div>
    </section>
  )
}
