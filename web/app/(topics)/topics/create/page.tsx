import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/auth/require-admin'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { PageWithAside } from '@/components/page-with-aside'
import CreateTopicPageClient from './create-topic-client'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Create Topic | Admin')

export default async function CreateTopicRoutePage() {
  await requireAdmin()
  return (
    <PageWithAside showFooter={false}>
      <CreateTopicPageClient />
    </PageWithAside>
  )
}
