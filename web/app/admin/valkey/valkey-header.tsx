'use client'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
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
    <div className='mb-8 space-y-4'>
      <Breadcrumbs items={VALKEY_BREADCRUMBS} />
      <AdminPageHeader
        dataPw='valkey-heading'
        description={t(
          'extracted.valkey.valkeyHeader.bloomFilterRebuildsAndCacheManagement_e0c4380f',
        )}
        title={t('extracted.valkey.valkeyHeader.valkey_2392ad6b')}
      >
        <Button
          disabled={loading}
          loading={loading}
          onClick={loadData}
          size='touch'
        >
          {loading
            ? t('extracted.valkey.valkeyHeader.refreshing_69d2daed')
            : t('extracted.valkey.valkeyHeader.refresh_0e916101')}
        </Button>
      </AdminPageHeader>
    </div>
  )
}
