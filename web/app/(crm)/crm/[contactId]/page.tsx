import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { crmContactHref } from '@/lib/links/entity-href'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import {
  getAdminCrmContact,
  getAdminCrmContactEmails,
  getAdminCrmContactNotes,
} from '@/lib/api/server/crm'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { CrmContactDetailClient } from './crm-contact-detail-client'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Contact | CRM | Admin')

export default async function CrmContactPage({
  params,
}: {
  params: Promise<{ contactId: string }>
}) {
  const { contactId } = await params

  const emptyPage = {
    results: [] as never[],
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  }

  const [detail, emailsData, notesData] = await Promise.all([
    getAdminCrmContact(contactId),
    getAdminCrmContactEmails(contactId, { searchParams: { limit: 25 } }).catch(() => emptyPage),
    getAdminCrmContactNotes(contactId, { searchParams: { limit: 25 } }).catch(() => emptyPage),
  ])

  if (!detail) notFound()

  const breadcrumbItems = buildBreadcrumbsForPath(crmContactHref({ id: contactId }), {
    isAuthenticated: true,
    userRoles: ['administrator'],
    tail: [
      { name: 'CRM', path: '/crm' },
      { name: detail.contact.name, path: crmContactHref({ id: contactId }) },
    ],
  })

  return (
    <div className='space-y-4'>
      <Breadcrumbs items={breadcrumbItems} />
      <h1
        data-pw='crm-contact-page-heading'
        className='text-xl font-semibold text-foreground'
      >
        <Link
          href={crmContactHref({ id: contactId })}
          prefetch={false}
          className='hover:underline focus-visible:underline'
        >
          {detail.contact.name}
        </Link>
      </h1>

      <CrmContactDetailClient
        key={contactId}
        contact={detail.contact}
        socialAccounts={detail.social_accounts}
        initialMessages={emailsData.results}
        initialNotes={notesData.results}
      />
    </div>
  )
}
