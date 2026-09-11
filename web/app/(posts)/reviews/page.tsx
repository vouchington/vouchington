import { PostListPage } from '@/components/posts/post-list-page'
import { postRouteConfigs } from '@/lib/route-configs'
import { createPageMetadata } from '@/lib/seo/metadata'
import { defaultTranslator } from '@ts-shared/ui-messages/default-translator'

export const metadata = createPageMetadata({
  title: defaultTranslator(postRouteConfigs.reviews.title),
  description: defaultTranslator(postRouteConfigs.reviews.description),
  path: '/reviews',
})

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export const dynamic = 'force-dynamic'

export default async function ReviewsPage({ searchParams }: PageProps) {
  return (
    <PostListPage
      config={postRouteConfigs.reviews}
      searchParams={searchParams}
    />
  )
}
