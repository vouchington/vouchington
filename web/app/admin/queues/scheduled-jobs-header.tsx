'use client'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { useTranslations } from '@/lib/i18n/use-translations'

const QUEUES_BREADCRUMBS = buildBreadcrumbsForPath('/admin/queues', {
  isAuthenticated: true,
  userRoles: ['administrator'],
  tail: [{ name: 'Queues', path: '/admin/queues' }],
})

export function ScheduledJobsHeader({
  loading,
  onRefresh,
}: {
  loading: boolean
  onRefresh: () => void
}) {
  const t = useTranslations()
  return (
    <div className='mb-8 space-y-4'>
      <Breadcrumbs items={QUEUES_BREADCRUMBS} />
      <AdminPageHeader
        dataPw='queues-heading'
        description={t('extracted.queues.scheduledJobsHeader.glideMqJobQueueManagement_4ecf9a0e')}
        title={t('extracted.queues.scheduledJobsHeader.queues_be77db11')}
      >
        <Button
          disabled={loading}
          loading={loading}
          onClick={onRefresh}
          size='touch'
          variant='outline'
        >
          {loading
            ? t('extracted.queues.scheduledJobsHeader.refreshing_69d2daed')
            : t('extracted.queues.scheduledJobsHeader.refresh_0e916101')}
        </Button>
        <Button
          asChild
          size='touch'
          variant='outline'
        >
          <a
            data-pw='glidemq-dashboard-link'
            href='/admin/mq-dashboard'
            rel='nofollow noopener noreferrer'
            target='_blank'
          >
            {t('extracted.queues.scheduledJobsHeader.openGlidemqDashboard_d613ee9c')}
          </a>
        </Button>
      </AdminPageHeader>
    </div>
  )
}
