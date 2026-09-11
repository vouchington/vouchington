'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { getAdminSupportContactClient } from '@/lib/api/client/support'
import { SUPPORT_DETAIL_PAGE_SIZE } from '@/lib/api/support-detail-page-size'
import { supportThreadHref } from '@/lib/links/entity-href'
import { mergePageResultsById } from '@ts-shared/utils/collections'
import type { SupportContactDetailResponse, SupportThreadsResponse } from '@/types/support'
import { SupportThreadStatusBadge } from '../../support-thread-status-badge'
import { useTranslations } from '@/lib/i18n/use-translations'

export function AdminSupportContactDetailClient({
  initialData,
}: {
  initialData: SupportContactDetailResponse
}) {
  const t = useTranslations()
  const initialThreads = useMemo<SupportThreadsResponse>(
    () => ({ results: initialData.threads, page_info: initialData.thread_page_info }),
    [initialData.thread_page_info, initialData.threads],
  )
  const { pages, hasNextPage, loadMore, loadingMore, fetchError, clearError } = usePaginatedList(
    initialThreads,
    `/api/v1/support/contacts/${initialData.contact.id}`,
    { limit: SUPPORT_DETAIL_PAGE_SIZE },
    {
      fetchPage: async (_endpoint, params) => {
        const data = await getAdminSupportContactClient(initialData.contact.id, {
          after: typeof params.after === 'string' ? params.after : undefined,
          limit: SUPPORT_DETAIL_PAGE_SIZE,
        })
        return { results: data.threads, page_info: data.thread_page_info }
      },
    },
  )
  const threads = mergePageResultsById(pages)
  const { contact } = initialData

  return (
    <div className='space-y-4'>
      <div className='rounded-lg border bg-card p-4'>
        <h1
          data-pw='support-contact-page-heading'
          className='text-xl font-bold text-foreground'
        >
          {contact.email_address}
        </h1>
        <dl className='mt-3 space-y-2 text-sm'>
          {contact.name && (
            <div className='flex gap-2'>
              <dt className='font-medium text-muted-foreground'>
                {t('extracted.contactid.adminSupportContactDetailClient.name_dcd1d522')}
              </dt>
              <dd>{contact.name}</dd>
            </div>
          )}
          {contact.user_id && (
            <div className='flex gap-2'>
              <dt className='font-medium text-muted-foreground'>
                {t('extracted.contactid.adminSupportContactDetailClient.userId_7967e089')}
              </dt>
              <dd className='font-mono'>{contact.user_id}</dd>
            </div>
          )}
          {contact.notes && (
            <div className='flex gap-2'>
              <dt className='font-medium text-muted-foreground'>
                {t('extracted.contactid.adminSupportContactDetailClient.notes_8a7525b1')}
              </dt>
              <dd>{contact.notes}</dd>
            </div>
          )}
          <div className='flex gap-2'>
            <dt className='font-medium text-muted-foreground'>
              {t('extracted.contactid.adminSupportContactDetailClient.created_d70b9e24')}
            </dt>
            <dd suppressHydrationWarning>{new Date(contact.created_at).toLocaleString()}</dd>
          </div>
        </dl>
      </div>

      <div>
        <h2 className='mb-3 text-lg font-semibold text-foreground'>
          {t('extracted.contactid.adminSupportContactDetailClient.supportThreads_e29ab337')}
        </h2>
        {threads.length === 0 ? (
          <div className='rounded-lg border bg-card p-8 text-center text-muted-foreground'>
            {t('extracted.contactid.adminSupportContactDetailClient.noThreadsYet_68944e10')}
          </div>
        ) : (
          <div className='overflow-hidden rounded-lg bg-card shadow-sm dark:shadow-none'>
            <table className='w-full'>
              <thead className='border-b bg-muted/50'>
                <tr>
                  <th
                    scope='col'
                    className='px-4 py-3 text-left text-sm font-medium'
                  >
                    {t('extracted.contactid.adminSupportContactDetailClient.subject_68971283')}
                  </th>
                  <th
                    scope='col'
                    className='px-4 py-3 text-left text-sm font-medium'
                  >
                    {t('extracted.contactid.adminSupportContactDetailClient.status_920e413c')}
                  </th>
                  <th
                    scope='col'
                    className='px-4 py-3 text-left text-sm font-medium'
                  >
                    {t('extracted.contactid.adminSupportContactDetailClient.created_d70b9e24')}
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
                        className='font-medium hover:underline'
                      >
                        {thread.subject}
                      </Link>
                    </td>
                    <td className='px-4 py-4 text-sm'>
                      <SupportThreadStatusBadge status={thread.status} />
                    </td>
                    <td
                      className='px-4 py-4 text-sm text-muted-foreground'
                      suppressHydrationWarning
                    >
                      {new Date(thread.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hasNextPage && (
          <div className='mt-3 flex justify-center'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                void loadMore()
              }}
              loading={loadingMore}
              disabled={loadingMore}
            >
              {t('extracted.contactid.adminSupportContactDetailClient.loadOlderThreads_913464fa')}
            </Button>
          </div>
        )}
        {fetchError && (
          <div className='mt-3 flex justify-center gap-2 text-sm text-destructive'>
            <span>
              {t(
                'extracted.contactid.adminSupportContactDetailClient.failedToLoadOlderThreads_fb168de8',
              )}
            </span>
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                clearError()
                void loadMore()
              }}
            >
              {t('extracted.contactid.adminSupportContactDetailClient.retry_942087cc')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
