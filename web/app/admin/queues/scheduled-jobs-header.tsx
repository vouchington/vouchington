'use client'

import { Loader2 } from 'lucide-react'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'

const breadcrumbItems = buildBreadcrumbsForPath('/admin/queues', {
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
    <>
      <Breadcrumbs items={breadcrumbItems} />
      <div className='mb-8 flex items-center justify-between'>
        <div>
          <h1
            data-pw='queues-heading'
            className='text-2xl font-bold text-foreground'
          >
            {t('extracted.queues.scheduledJobsHeader.queues_be77db11')}
          </h1>
          <p className='mt-2 text-muted-foreground'>
            {t('extracted.queues.scheduledJobsHeader.glideMqJobQueueManagement_4ecf9a0e')}
          </p>
        </div>
        <div className='flex gap-3'>
          <Button
            onClick={onRefresh}
            variant='outline'
            disabled={loading}
          >
            {loading ? (
              <span className='flex items-center gap-2'>
                <Loader2 className='h-4 w-4 animate-spin' />
                {t('extracted.queues.scheduledJobsHeader.refreshing_69d2daed')}
              </span>
            ) : (
              t('extracted.queues.scheduledJobsHeader.refresh_0e916101')
            )}
          </Button>
          <Button
            variant='outline'
            asChild
          >
            <a
              href='/admin/mq-dashboard'
              target='_blank'
              rel='nofollow noopener noreferrer'
              data-pw='glidemq-dashboard-link'
            >
              {t('extracted.queues.scheduledJobsHeader.openGlidemqDashboard_d613ee9c')}
            </a>
          </Button>
        </div>
      </div>
    </>
  )
}
