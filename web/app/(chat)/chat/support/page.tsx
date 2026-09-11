import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { PageWithAside } from '@/components/page-with-aside'
import { getMySupportThreads } from '@/lib/api/server'
import { chatSupportThreadHref } from '@/lib/links/entity-href'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import type { SupportThread } from '@/types/support'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Support')

async function ThreadStatusBadge({ status }: { status: SupportThread['status'] }) {
  const t = await getTranslations()
  if (status === 'open') {
    return (
      <Badge className='bg-yellow-100 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-900 dark:text-yellow-200'>
        {t('extracted.support.page.open_2348f998')}
      </Badge>
    )
  }
  if (status === 'assigned') {
    return (
      <Badge className='bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-200'>
        {t('extracted.support.page.assigned_2ebb9294')}
      </Badge>
    )
  }
  return (
    <Badge className='bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900 dark:text-green-200'>
      {t('extracted.support.page.resolved_dc676b42')}
    </Badge>
  )
}

export default async function SupportPage() {
  const t = await getTranslations()
  const threadsResponse = await getMySupportThreads({ limit: 30 })
  const threads = threadsResponse.results

  const breadcrumbItems = buildBreadcrumbsForPath('/chat/support', {
    isAuthenticated: true,
    userRoles: [],
    tail: [{ name: 'Support', path: '/chat/support' }],
  })

  return (
    <PageWithAside showFooter={false}>
      <div className='space-y-4'>
        <Breadcrumbs items={breadcrumbItems} />
        <div className='flex items-start justify-between gap-4'>
          <PageHeader
            title={t('extracted.support.page.support_be91940b')}
            description={t('extracted.support.page.viewAndManageYourSupport_1d84e6b3')}
          />
          <Button asChild>
            <Link
              href='/chat/support/new'
              prefetch={false}
              data-pw='support-new-request-link'
            >
              <Plus className='mr-2 h-4 w-4' />
              {t('extracted.support.page.newRequest_c648d399')}
            </Link>
          </Button>
        </div>

        {threads.length === 0 ? (
          <div className='rounded-lg border bg-card p-12 text-center'>
            <p className='text-muted-foreground'>
              {t('extracted.support.page.youHaveNoSupportRequestsYet_a9589eaf')}
            </p>
            <Button
              asChild
              className='mt-4'
            >
              <Link
                href='/chat/support/new'
                prefetch={false}
              >
                {t('extracted.support.page.submitARequest_6b491c73')}
              </Link>
            </Button>
          </div>
        ) : (
          <div className='overflow-hidden rounded-lg bg-card shadow-sm dark:shadow-none'>
            <table className='w-full'>
              <thead className='border-b bg-muted/50'>
                <tr>
                  <th
                    scope='col'
                    className='px-4 py-3 text-left text-sm font-medium text-foreground'
                  >
                    {t('extracted.support.page.subject_68971283')}
                  </th>
                  <th
                    scope='col'
                    className='px-4 py-3 text-left text-sm font-medium text-foreground'
                  >
                    {t('extracted.support.page.status_920e413c')}
                  </th>
                  <th
                    scope='col'
                    className='px-4 py-3 text-left text-sm font-medium text-foreground'
                  >
                    {t('extracted.support.page.created_d70b9e24')}
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
                        href={chatSupportThreadHref(thread)}
                        prefetch={false}
                        className='font-medium text-foreground hover:underline'
                      >
                        {thread.subject}
                      </Link>
                    </td>
                    <td className='px-4 py-4 text-sm'>
                      <ThreadStatusBadge status={thread.status} />
                    </td>
                    <td
                      className='whitespace-nowrap px-4 py-4 text-sm text-muted-foreground'
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
      </div>
    </PageWithAside>
  )
}
