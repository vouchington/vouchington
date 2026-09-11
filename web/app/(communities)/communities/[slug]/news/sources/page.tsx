import {
  COMMUNITY_NEWS_SOURCES_FILTER,
  CommunityNewsPage,
} from '@/components/communities/community-news-page'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Community Source News')

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function CommunityNewsSourcesPage(props: PageProps) {
  return CommunityNewsPage({ ...props, filter: COMMUNITY_NEWS_SOURCES_FILTER })
}
