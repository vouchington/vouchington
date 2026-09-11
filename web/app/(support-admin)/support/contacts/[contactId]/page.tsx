import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { getAdminSupportContact } from '@/lib/api/server'
import { SUPPORT_DETAIL_PAGE_SIZE } from '@/lib/api/support-detail-page-size'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { supportContactHref } from '@/lib/links/entity-href'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { AdminSupportContactDetailClient } from './admin-support-contact-detail-client'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Support Contact | Admin')

export default async function AdminSupportContactPage({
  params,
}: {
  params: Promise<{ contactId: string }>
}) {
  const { contactId } = await params
  const data = await getAdminSupportContact(contactId, { limit: SUPPORT_DETAIL_PAGE_SIZE })
  if (!data) notFound()
  const breadcrumbItems = buildBreadcrumbsForPath(supportContactHref(contactId), {
    isAuthenticated: true,
    userRoles: ['administrator'],
    tail: [
      { name: 'Support', path: '/support' },
      { name: 'Contacts', path: '/support/contacts' },
      { name: data.contact.email_address, path: supportContactHref(contactId) },
    ],
  })
  return (
    <>
      <Breadcrumbs items={breadcrumbItems} />
      <AdminSupportContactDetailClient initialData={data} />
    </>
  )
}
