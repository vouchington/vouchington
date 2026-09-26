'use client'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { useTranslations } from '@/lib/i18n/use-translations'

const POSTGRESQL_BREADCRUMBS = buildBreadcrumbsForPath('/admin/postgresql', {
  isAuthenticated: true,
  userRoles: ['administrator'],
  tail: [{ name: 'PostgreSQL', path: '/admin/postgresql' }],
})

export function PostgreSQLHeader({
  loadData,
  loading,
}: {
  loadData: () => void
  loading: boolean
}) {
  const t = useTranslations()
  return (
    <div className='mb-8 space-y-4'>
      <Breadcrumbs items={POSTGRESQL_BREADCRUMBS} />
      <AdminPageHeader
        dataPw='postgresql-heading'
        description={t(
          'extracted.postgresql.postgresqlHeader.databaseMigrationsAndManagement_61e05d66',
        )}
        title={t('extracted.postgresql.postgresqlHeader.postgresql_cc52d032')}
      >
        <Button
          disabled={loading}
          loading={loading}
          onClick={loadData}
          size='touch'
        >
          {loading
            ? t('extracted.postgresql.postgresqlHeader.refreshing_69d2daed')
            : t('extracted.postgresql.postgresqlHeader.refresh_0e916101')}
        </Button>
      </AdminPageHeader>
    </div>
  )
}
