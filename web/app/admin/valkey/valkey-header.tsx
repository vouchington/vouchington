'use client'

import { Loader2 } from 'lucide-react'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'

const VALKEY_BREADCRUMBS = buildBreadcrumbsForPath('/admin/valkey', {
  isAuthenticated: true,
  userRoles: ['administrator'],
  tail: [{ name: 'Valkey', path: '/admin/valkey' }],
})

interface ValkeyHeaderProps {
  loadData: () => void
  loading: boolean
}

export function ValkeyHeader({ loadData, loading }: ValkeyHeaderProps) {
  const t = useTranslations()
  return (
    <>
      <Breadcrumbs items={VALKEY_BREADCRUMBS} />
      <div className='flex justify-between items-center mb-8'>
        <div>
          <h1
            data-pw='valkey-heading'
            className='text-2xl font-bold text-foreground'
          >
            {t('extracted.valkey.valkeyHeader.valkey_2392ad6b')}
          </h1>
          <p className='text-muted-foreground mt-2'>
            {t('extracted.valkey.valkeyHeader.bloomFilterRebuildsAndCacheManagement_e0c4380f')}
          </p>
        </div>
        <Button
          onClick={loadData}
          disabled={loading}
        >
          {loading ? (
            <span className='flex items-center gap-2'>
              <Loader2 className='w-4 h-4 animate-spin' />
              {t('extracted.valkey.valkeyHeader.refreshing_69d2daed')}
            </span>
          ) : (
            t('extracted.valkey.valkeyHeader.refresh_0e916101')
          )}
        </Button>
      </div>
    </>
  )
}
