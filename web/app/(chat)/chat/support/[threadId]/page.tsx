import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { PageWithAside } from '@/components/page-with-aside'
import { getMySupportThread } from '@/lib/api/server'
import { chatSupportThreadHref } from '@/lib/links/entity-href'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import type { SupportMessage, SupportThread } from '@/types/support'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Support Thread')

interface Props {
  params: Promise<{ threadId: string }>
}

async function ThreadStatusBadge({ status }: { status: SupportThread['status'] }) {
  const t = await getTranslations()
  if (status === 'open') {
    return (
      <Badge className='bg-yellow-100 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-900 dark:text-yellow-200'>
        {t('extracted.threadid.page.open_2348f998')}
      </Badge>
    )
  }
  if (status === 'assigned') {
    return (
      <Badge className='bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-200'>
        {t('extracted.threadid.page.inProgress_2b6b853c')}
      </Badge>
    )
  }
  return (
    <Badge className='bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900 dark:text-green-200'>
      {t('extracted.threadid.page.resolved_dc676b42')}
    </Badge>
  )
}

async function MessageItem({ message }: { message: SupportMessage }) {
  const t = await getTranslations()
  const isInbound = message.direction === 'inbound'
  return (
    <div
      className={`rounded-lg border p-4 ${isInbound ? 'bg-blue-50/50 dark:bg-blue-950/20' : 'bg-card'}`}
    >
      <div className='mb-2 flex items-center gap-2 text-xs text-muted-foreground'>
        <span className='font-medium'>
          {isInbound
            ? t('extracted.threadid.page.you_08b04193')
            : t('extracted.threadid.page.support_be91940b')}
        </span>
        <span
          className='ml-auto'
          suppressHydrationWarning
        >
          {new Date(message.created_at).toLocaleString()}
        </span>
        {message.sent_at && (
          <Badge
            variant='outline'
            className='text-xs'
          >
            {t('extracted.threadid.page.sent_7afbb334')}
          </Badge>
        )}
        {message.drafted_at && !message.sent_at && (
          <Badge
            variant='outline'
            className='text-xs text-muted-foreground'
          >
            {t('extracted.threadid.page.draft_7743ce34')}
          </Badge>
        )}
      </div>
      <p className='whitespace-pre-wrap text-sm text-foreground'>{message.body_text}</p>
    </div>
  )
}

export default async function SupportThreadPage({ params }: Props) {
  const t = await getTranslations()
  const { threadId } = await params
  const data = await getMySupportThread(threadId)

  if (!data) notFound()

  const { thread, messages } = data

  const breadcrumbItems = buildBreadcrumbsForPath(chatSupportThreadHref(thread), {
    isAuthenticated: true,
    userRoles: [],
    tail: [
      { name: 'Support', path: '/chat/support' },
      { name: thread.subject, path: chatSupportThreadHref(thread) },
    ],
  })

  return (
    <PageWithAside showFooter={false}>
      <div className='space-y-4'>
        <Breadcrumbs items={breadcrumbItems} />
        <div className='flex items-start justify-between gap-4'>
          <PageHeader title={thread.subject} />
          <ThreadStatusBadge status={thread.status} />
        </div>
        <p
          className='text-sm text-muted-foreground'
          suppressHydrationWarning
        >
          {t('extracted.threadid.page.openedDate_bbbc4db0', {
            date: new Date(thread.created_at).toLocaleString(),
          })}
        </p>

        <div className='space-y-3'>
          {messages.length === 0 ? (
            <div className='rounded-lg border bg-card p-8 text-center text-muted-foreground'>
              {t('extracted.threadid.page.noMessagesYetOurTeamWill_c867a0ee')}
            </div>
          ) : (
            messages.map(message => (
              <MessageItem
                key={message.id}
                message={message}
              />
            ))
          )}
        </div>

        <Button
          asChild
          variant='outline'
        >
          <Link
            href='/chat/support'
            prefetch={false}
          >
            {t('extracted.threadid.page.backToSupport_f7eb121b')}
          </Link>
        </Button>
      </div>
    </PageWithAside>
  )
}
