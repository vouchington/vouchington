import { PostListPage } from '@/components/posts/post-list-page'
import { postRouteConfigs } from '@/lib/route-configs'
import { createPageMetadata } from '@/lib/seo/metadata'
import { defaultTranslator } from '@ts-shared/ui-messages/default-translator'

export const metadata = createPageMetadata({
  title: defaultTranslator(postRouteConfigs.posts.title),
  description: defaultTranslator(postRouteConfigs.posts.description),
  path: '/posts',
})

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export const dynamic = 'force-dynamic'

export default async function PostsPage({ searchParams }: PageProps) {
  return (
    <PostListPage
      config={postRouteConfigs.posts}
      searchParams={searchParams}
    />
  )
}
