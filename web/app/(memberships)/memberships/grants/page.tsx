import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import MembershipsAdminClient from './memberships-admin-client'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Memberships | Admin')

export default function MembershipsAdminPage() {
  return <MembershipsAdminClient />
}
