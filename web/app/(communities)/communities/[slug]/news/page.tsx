import {
  COMMUNITY_NEWS_ALL_FILTER,
  CommunityNewsPage,
} from '@/components/communities/community-news-page'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Community News')

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function CommunityNewsAllPage(props: PageProps) {
  return CommunityNewsPage({ ...props, filter: COMMUNITY_NEWS_ALL_FILTER })
}
