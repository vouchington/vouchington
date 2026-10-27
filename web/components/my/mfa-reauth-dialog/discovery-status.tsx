'use client'

import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { useReAuthMethods } from './use-reauth-methods'

export function ReAuthDiscoveryStatus({
  discovery,
  hasMethods,
}: {
  discovery: ReturnType<typeof useReAuthMethods>
  hasMethods: boolean
}) {
  const t = useTranslations()
  if (hasMethods) return null
  const loading = !discovery.methods && !discovery.error
  return (
    <div className='space-y-2'>
      {!loading && (
        <p role='alert'>{t('extracted.auth.mfaStep.unableToVerifyPleaseTryAgain_b7979b96')}</p>
      )}
      <Button
        loading={loading}
        onClick={() => discovery.retry()}
      >
        {loading
          ? t('extracted.shared.paginatedListFooter.loading_ba3bbbe1')
          : t('extracted.shared.paginatedListFooter.retry_942087cc')}
      </Button>
    </div>
  )
}
