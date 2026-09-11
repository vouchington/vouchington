'use client'

import { Loader2 } from 'lucide-react'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { Button } from '@/components/ui/button'
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
    <>
      <Breadcrumbs items={POSTGRESQL_BREADCRUMBS} />
      <div className='flex justify-between items-center mb-8'>
        <div>
          <h1
            data-pw='postgresql-heading'
            className='text-2xl font-bold text-foreground'
          >
            {t('extracted.postgresql.postgresqlHeader.postgresql_cc52d032')}
          </h1>
          <p className='text-muted-foreground mt-2'>
            {t('extracted.postgresql.postgresqlHeader.databaseMigrationsAndManagement_61e05d66')}
          </p>
        </div>
        <Button
          onClick={() => loadData()}
          disabled={loading}
        >
          {loading ? (
            <span className='flex items-center gap-2'>
              <Loader2 className='w-4 h-4 animate-spin' />
              {t('extracted.postgresql.postgresqlHeader.refreshing_69d2daed')}
            </span>
          ) : (
            t('extracted.postgresql.postgresqlHeader.refresh_0e916101')
          )}
        </Button>
      </div>
    </>
  )
}
