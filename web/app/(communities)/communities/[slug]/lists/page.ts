export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createCommunityPathname } from '@/lib/links/entity-href'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const metadata: Metadata = createNoIndexMetadata('Community Lists')

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function CommunityListsPage({ params }: PageProps) {
  const { slug } = await params
  redirect(createCommunityPathname(slug, '/lists/topics'))
}
