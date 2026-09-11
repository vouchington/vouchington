'use client'

import type { useTurnstileToken } from '@/hooks/use-turnstile-token'
import { useTranslations } from '@/lib/i18n/use-translations'

interface TurnstileFieldProps {
  /** The object returned by {@link useTurnstileToken}. */
  turnstile: Pick<ReturnType<typeof useTurnstileToken>, 'containerRef' | 'isError'> & {
    alwaysApprove?: boolean
  }
}

/**
 * Renders the Cloudflare Turnstile widget container plus an inline error message.
 * Pair with {@link useTurnstileToken}, which owns the token state and the callback
 * ref rendered here. Used by every content-creation form so the widget markup and
 * error copy stay consistent.
 */
export function TurnstileField({ turnstile }: TurnstileFieldProps) {
  const t = useTranslations()
  const { containerRef, isError, alwaysApprove = false } = turnstile
  if (alwaysApprove) return null
  return (
    <div className='space-y-1'>
      <div
        ref={containerRef}
        data-pw='turnstile-container'
      />
      {isError && (
        <p className='text-sm text-destructive'>
          {t('extracted.shared.turnstileField.verificationFailedToLoadPleaseRefresh_0639fdb3')}
        </p>
      )}
    </div>
  )
}
