'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { Button } from '@/components/ui/button'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminTableShell } from '@/components/admin/admin-table-shell'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { supportThreadHref } from '@/lib/links/entity-href'
import { mergePageResultsById } from '@ts-shared/utils/collections'
import type { SupportThreadsResponse } from '@/types/support'
import { SupportThreadStatusBadge } from './support-thread-status-badge'
import { AdminSupportThreadFilters } from './admin-support-thread-filters'
import { useTranslations } from '@/lib/i18n/use-translations'

export function AdminSupportThreadsClient({
  initialData,
  initialQ,
  initialStatus,
}: {
  initialData: SupportThreadsResponse
  initialQ: string | undefined
  initialStatus: 'open' | 'assigned' | 'resolved' | undefined
}) {
  const t = useTranslations()
  const { replace, refresh } = useRouter()
  const [isPending, startTransition] = useTransition()

  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(initialData, '/api/v1/support/threads', {
      q: initialQ,
      status: initialStatus,
    })

  const threads = mergePageResultsById(pages)

  return (
    <>
      <div>
        <div className='mb-8'>
          <AdminPageHeader
            title={t('extracted.support.adminSupportThreadsClient.supportThreads_a8187e3f')}
            description={t(
              'extracted.support.adminSupportThreadsClient.manageCustomerSupportRequests_1a5e7c93',
            )}
          >
            <AdminSupportThreadFilters
              initialQ={initialQ}
              initialStatus={initialStatus}
              isPending={isPending}
              onChange={({ q, status }) => {
                const params = new URLSearchParams()
                if (q) params.set('q', q)
                if (status !== 'all') params.set('status', status)
                startTransition(() => replace(`/support${params.size > 0 ? `?${params}` : ''}`))
              }}
            />
            <Button
              data-pw='support-threads-refresh'
              variant='outline'
              size='touchIcon'
              onClick={() => {
                startTransition(() => {
                  refresh()
                })
              }}
              aria-label={t('extracted.support.adminSupportThreadsClient.refreshThreads_4e20c0d7')}
              disabled={isPending}
            >
              <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
            </Button>
          </AdminPageHeader>
        </div>

        <InfiniteScroll
          hasNextPage={hasNextPage}
          endCursor={endCursor}
          onLoadMore={loadMore}
          loadingMore={loadingMore}
          fetchError={fetchError}
          clearError={clearError}
          resetKey={resetKey}
        >
          <AdminTableShell
            aria-label={t('extracted.support.adminSupportThreadsClient.supportThreads_a8187e3f')}
            isEmpty={threads.length === 0}
            emptyMessage={t(
              'extracted.support.adminSupportThreadsClient.noStatusThreadsFound_6d3f9a42',
              {
                status: initialStatus ?? '',
              },
            )}
          >
            <table className='w-full'>
              <thead className='border-b bg-muted/50'>
                <tr>
                  <th
                    data-pw='support-threads-column-subject'
                    scope='col'
                    className='px-4 py-3 text-left text-sm font-medium text-foreground'
                  >
                    {t('extracted.support.adminSupportThreadsClient.subject_68971283')}
                  </th>
                  <th
                    data-pw='support-threads-column-status'
                    scope='col'
                    className='px-4 py-3 text-left text-sm font-medium text-foreground'
                  >
                    {t('extracted.support.adminSupportThreadsClient.status_920e413c')}
                  </th>
                  <th
                    data-pw='support-threads-column-created'
                    scope='col'
                    className='px-4 py-3 text-left text-sm font-medium text-foreground'
                  >
                    {t('extracted.support.adminSupportThreadsClient.created_d70b9e24')}
                  </th>
                  <th
                    data-pw='support-threads-column-updated'
                    scope='col'
                    className='px-4 py-3 text-left text-sm font-medium text-foreground'
                  >
                    {t('extracted.support.adminSupportThreadsClient.updated_3a5ecca1')}
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y'>
                {threads.map(thread => (
                  <tr
                    key={thread.id}
                    className='hover:bg-muted/50'
                  >
                    <td className='px-4 py-4 text-sm'>
                      <Link
                        href={supportThreadHref(thread)}
                        prefetch={false}
                        className='font-medium text-foreground hover:underline'
                        // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
                        data-pw={`support-thread-link-${thread.id}`}
                      >
                        {thread.subject}
                      </Link>
                    </td>
                    <td className='px-4 py-4 text-sm'>
                      <SupportThreadStatusBadge status={thread.status} />
                    </td>
                    <td
                      className='whitespace-nowrap px-4 py-4 text-sm text-muted-foreground'
                      suppressHydrationWarning
                    >
                      {new Date(thread.created_at).toLocaleDateString()}
                    </td>
                    <td
                      className='whitespace-nowrap px-4 py-4 text-sm text-muted-foreground'
                      suppressHydrationWarning
                    >
                      {new Date(thread.updated_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableShell>
        </InfiniteScroll>
      </div>
      {fetchError && (
        <div className='flex flex-col items-center gap-2 py-4'>
          <p className='text-sm text-destructive'>
            {t('extracted.support.adminSupportThreadsClient.failedToLoadMore_e1499d61')}
          </p>
          <Button
            variant='outline'
            size='touchSm'
            onClick={() => {
              clearError()
              void loadMore()
            }}
          >
            {t('extracted.support.adminSupportThreadsClient.retry_942087cc')}
          </Button>
        </div>
      )}
    </>
  )
}
