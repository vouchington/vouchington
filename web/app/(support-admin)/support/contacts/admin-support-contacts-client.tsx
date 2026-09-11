'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, RefreshCw } from 'lucide-react'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@/components/shared/search-input'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminTableShell } from '@/components/admin/admin-table-shell'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { supportContactHref, supportContactsHref } from '@/lib/links/entity-href'
import { mergePageResultsById } from '@ts-shared/utils/collections'
import type { SupportContactsResponse } from '@/types/support'
import { useTranslations } from '@/lib/i18n/use-translations'

export function AdminSupportContactsClient({
  initialData,
  initialQ,
}: {
  initialData: SupportContactsResponse
  initialQ: string | undefined
}) {
  const t = useTranslations()
  const { replace, refresh } = useRouter()
  const [isPending, startTransition] = useTransition()
  const [q, setQ] = useState(initialQ ?? '')

  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(initialData, '/api/v1/support/contacts', { q: initialQ })

  const contacts = mergePageResultsById(pages)

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    startTransition(() => {
      const query = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''
      replace(supportContactsHref(query))
    })
  }

  return (
    <>
      <div>
        <div className='mb-8'>
          <AdminPageHeader
            title={t('extracted.contacts.adminSupportContactsClient.supportContacts_96f650a3')}
            description={t(
              'extracted.contacts.adminSupportContactsClient.searchAndManageSupportContacts_8c2b4f71',
            )}
          >
            <Button
              variant='outline'
              size='touchIcon'
              onClick={() => {
                startTransition(() => {
                  refresh()
                })
              }}
              aria-label={t(
                'extracted.contacts.adminSupportContactsClient.refreshContacts_1a9514f6',
              )}
              disabled={isPending}
            >
              <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
            </Button>
          </AdminPageHeader>
        </div>

        <form
          onSubmit={handleSearch}
          className='mb-6 flex max-w-lg gap-2'
        >
          <SearchInput
            aria-label={t(
              'extracted.contacts.adminSupportContactsClient.searchSupportContacts_32edbc28',
            )}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={t(
              'extracted.contacts.adminSupportContactsClient.searchByEmailOrName_06321e06',
            )}
            className='h-11 min-w-0 flex-1 sm:h-9'
          />
          <Button
            type='submit'
            size='touchIcon'
            variant='outline'
            disabled={isPending}
            aria-label={t('extracted.contacts.adminSupportContactsClient.search_49c266ba')}
          >
            <Search className='h-4 w-4' />
          </Button>
        </form>

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
            aria-label={t('extracted.contacts.adminSupportContactsClient.supportContacts_96f650a3')}
            isEmpty={contacts.length === 0}
            emptyMessage={t(
              'extracted.contacts.adminSupportContactsClient.noContactsFound_4e9a1d56',
            )}
          >
            <table className='w-full'>
              <thead className='border-b bg-muted/50'>
                <tr>
                  <th
                    scope='col'
                    className='px-4 py-3 text-left text-sm font-medium text-foreground'
                  >
                    {t('extracted.contacts.adminSupportContactsClient.email_969ccbd3')}
                  </th>
                  <th
                    scope='col'
                    className='px-4 py-3 text-left text-sm font-medium text-foreground'
                  >
                    {t('extracted.contacts.adminSupportContactsClient.name_dcd1d522')}
                  </th>
                  <th
                    scope='col'
                    className='px-4 py-3 text-left text-sm font-medium text-foreground'
                  >
                    {t('extracted.contacts.adminSupportContactsClient.userId_7967e089')}
                  </th>
                  <th
                    scope='col'
                    className='px-4 py-3 text-left text-sm font-medium text-foreground'
                  >
                    {t('extracted.contacts.adminSupportContactsClient.created_d70b9e24')}
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y'>
                {contacts.map(contact => (
                  <tr
                    key={contact.id}
                    className='hover:bg-muted/50'
                  >
                    <td className='px-4 py-4 text-sm'>
                      <Link
                        href={supportContactHref(contact)}
                        prefetch={false}
                        className='font-medium text-foreground hover:underline'
                        // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier derived from contact id
                        data-pw={`support-contact-link-${contact.id}`}
                      >
                        {contact.email_address}
                      </Link>
                    </td>
                    <td className='px-4 py-4 text-sm text-muted-foreground'>
                      {contact.name || '—'}
                    </td>
                    <td className='px-4 py-4 font-mono text-sm text-muted-foreground'>
                      {contact.user_id ? `${contact.user_id.slice(0, 8)}…` : '—'}
                    </td>
                    <td
                      className='whitespace-nowrap px-4 py-4 text-sm text-muted-foreground'
                      suppressHydrationWarning
                    >
                      {new Date(contact.created_at).toLocaleDateString()}
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
            {t('extracted.contacts.adminSupportContactsClient.failedToLoadMore_e1499d61')}
          </p>
          <Button
            variant='outline'
            size='touchSm'
            onClick={() => {
              clearError()
              void loadMore()
            }}
          >
            {t('extracted.contacts.adminSupportContactsClient.retry_942087cc')}
          </Button>
        </div>
      )}
    </>
  )
}
