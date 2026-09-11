'use client'

import type { MfaStatus } from '@/types/user'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  mfaStatus: MfaStatus
}

/**
 * Displays the current MFA on/off status on the identity settings page.
 *
 * MFA is implicitly enabled once the user enrolls at least one passkey or
 * TOTP authenticator — there is no separate toggle. This banner makes the
 * effective state visible and explains how to change it.
 */
export function MfaStatusBanner({ mfaStatus }: Props) {
  const t = useTranslations()
  const { has_mfa } = mfaStatus

  return (
    <div
      className='space-y-1'
      data-pw='mfa-status-banner'
    >
      <div className='flex items-center gap-2'>
        <h2 className='text-base font-semibold'>
          {t('extracted.my.mfaStatusBanner.multiFactorAuthentication_0ed4c5fa')}
        </h2>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            has_mfa
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-muted text-muted-foreground'
          }`}
          data-pw='mfa-status-badge'
        >
          {has_mfa
            ? t('extracted.my.mfaStatusBanner.on_13001175')
            : t('extracted.my.mfaStatusBanner.off_ca7981b4')}
        </span>
      </div>
      <p className='text-sm text-muted-foreground'>
        {has_mfa
          ? t('extracted.my.mfaStatusBanner.yourAccountRequiresASecondFactor_0cc916d1')
          : t('extracted.my.mfaStatusBanner.addAPasskeyOrAuthenticatorApp_5d0aa9aa')}
      </p>
    </div>
  )
}
