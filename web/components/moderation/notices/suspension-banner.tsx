'use client'

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { SuspensionNotice } from '@/lib/auth/client-auth-user'

/**
 * Shown globally at the top of every page when the authenticated user's account
 * is suspended. Reads suspension state from the auth context — no extra fetch.
 *
 * Returns null for non-suspended and anonymous users.
 */
export function SuspensionBanner({ notice }: { notice: SuspensionNotice | null }) {
  const t = useTranslations()
  if (!notice) return null

  return (
    <div data-pw='suspension-banner'>
      <Alert
        variant='destructive'
        className='rounded-none border-x-0 border-t-0'
      >
        <AlertTriangle className='h-4 w-4' />
        <AlertTitle>
          {t('extracted.notices.suspensionBanner.yourAccountHasBeenSuspended_b51655b9')}
        </AlertTitle>
        <AlertDescription className='flex flex-wrap items-center gap-x-1'>
          {notice.reason ? (
            <span>{notice.reason}</span>
          ) : (
            <span>
              {t('extracted.notices.suspensionBanner.yourAccountAccessHasBeenRestricted_c31541d4')}
            </span>
          )}
          <Link
            href='/my/account-status'
            className='font-medium underline'
            prefetch={false}
          >
            {t('extracted.notices.suspensionBanner.learnMore_1445799c')}
          </Link>
        </AlertDescription>
      </Alert>
    </div>
  )
}
