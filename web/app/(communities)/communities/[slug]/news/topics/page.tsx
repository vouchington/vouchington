import {
  COMMUNITY_NEWS_TOPICS_FILTER,
  CommunityNewsPage,
} from '@/components/communities/community-news-page'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Community Topic News')

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function CommunityNewsTopicsPage(props: PageProps) {
  return CommunityNewsPage({ ...props, filter: COMMUNITY_NEWS_TOPICS_FILTER })
}
