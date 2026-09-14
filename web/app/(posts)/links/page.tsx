import type { Metadata } from 'next'
import { PostListPage } from '@/components/posts/post-list-page'
import { postRouteConfigs } from '@/lib/route-configs'
import { createPageMetadata } from '@/lib/seo/metadata'
import { getTranslations } from '@/lib/i18n/get-translations'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return createPageMetadata({
    title: t(postRouteConfigs.links.title),
    description: t(postRouteConfigs.links.description),
    path: `/${postRouteConfigs.links.pluralPath}`,
  })
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export const dynamic = 'force-dynamic'

export default async function LinksPage({ searchParams }: PageProps) {
  return (
    <PostListPage
      config={postRouteConfigs.links}
      searchParams={searchParams}
    />
  )
}
