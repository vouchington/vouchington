import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { getAdminSupportContacts } from '@/lib/api/server'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { AdminSupportContactsClient } from './admin-support-contacts-client'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Support Contacts | Admin')

interface PageProps {
  searchParams: Promise<{ q?: string }>
}

export default async function AdminSupportContactsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const q = params.q ?? undefined

  const initialData = await getAdminSupportContacts({ q, limit: 30 })

  const breadcrumbItems = buildBreadcrumbsForPath('/support/contacts', {
    isAuthenticated: true,
    userRoles: ['administrator'],
    tail: [
      { name: 'Support', path: '/support' },
      { name: 'Contacts', path: '/support/contacts' },
    ],
  })

  return (
    <>
      <Breadcrumbs items={breadcrumbItems} />
      <AdminSupportContactsClient
        initialData={initialData}
        initialQ={q}
      />
    </>
  )
}
