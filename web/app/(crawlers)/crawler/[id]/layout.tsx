import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/auth/require-admin'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { PageWithAside } from '@/components/page-with-aside'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Crawler')

export default async function CrawlerLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return <PageWithAside showFooter={false}>{children}</PageWithAside>
}
