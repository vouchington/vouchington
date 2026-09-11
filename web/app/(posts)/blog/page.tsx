import { PostListPage } from '@/components/posts/post-list-page'
import { postRouteConfigs } from '@/lib/route-configs'
import { createPageMetadata } from '@/lib/seo/metadata'
import { defaultTranslator } from '@ts-shared/ui-messages/default-translator'

export const metadata = createPageMetadata({
  title: defaultTranslator(postRouteConfigs.blog.title),
  description: defaultTranslator(postRouteConfigs.blog.description),
  path: '/blog',
})

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export const dynamic = 'force-dynamic'

export default async function BlogPage({ searchParams }: PageProps) {
  return (
    <PostListPage
      config={postRouteConfigs.blog}
      searchParams={searchParams}
    />
  )
}
