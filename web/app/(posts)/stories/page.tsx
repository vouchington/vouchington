import type { Metadata } from 'next'
import { PostListPage } from '@/components/posts/post-list-page'
import { postRouteConfigs } from '@/lib/route-configs'
import { createPageMetadata } from '@/lib/seo/metadata'
import { defaultTranslator } from '@ts-shared/ui-messages/default-translator'

export const metadata: Metadata = createPageMetadata({
  title: defaultTranslator(postRouteConfigs.stories.title),
  description: defaultTranslator(postRouteConfigs.stories.description),
  path: `/${postRouteConfigs.stories.pluralPath}`,
})

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export const dynamic = 'force-dynamic'

export default async function StoriesPage({ searchParams }: PageProps) {
  return (
    <PostListPage
      config={postRouteConfigs.stories}
      searchParams={searchParams}
    />
  )
}
