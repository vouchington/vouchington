import { PostListPage } from '@/components/posts/post-list-page'
import { postRouteConfigs } from '@/lib/route-configs'
import { createPageMetadata } from '@/lib/seo/metadata'
import { defaultTranslator } from '@ts-shared/ui-messages/default-translator'

export const metadata = createPageMetadata({
  title: defaultTranslator(postRouteConfigs.articles.title),
  description: defaultTranslator(postRouteConfigs.articles.description),
  path: '/articles',
})

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export const dynamic = 'force-dynamic'

export default async function ArticlesPage({ searchParams }: PageProps) {
  return (
    <PostListPage
      config={postRouteConfigs.articles}
      searchParams={searchParams}
    />
  )
}
