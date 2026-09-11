import { getEntityRelations } from '@/lib/api/server'
import { POST_RELATED_URL_SUMMARY_SEARCH_PARAMS } from '@/components/tags/tag-relation-configs'
import { HnDiscussionsAside } from '@/components/asides/hn-discussions-aside'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import type { Post } from '@/types/posts'

const EMPTY_EXTRA_URLS: Array<string | null | undefined> = []

function relatedUrl(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export async function HnDiscussionsPostAside({
  extraUrls = EMPTY_EXTRA_URLS,
  post,
}: {
  extraUrls?: Array<string | null | undefined>
  post: Post
}) {
  const currentUser = await getCurrentUser()
  let relatedUrls: string[] = []
  try {
    const response = await getEntityRelations('post', post.id, 'related', 'url', {
      searchParams: POST_RELATED_URL_SUMMARY_SEARCH_PARAMS,
    })
    relatedUrls = response.results.flatMap(result => {
      const url = relatedUrl(response.entity_relations[result.id]?.object_data.url)
      return url ? [url] : []
    })
  } catch {
    relatedUrls = []
  }

  return (
    <HnDiscussionsAside
      enabled={currentUser?.hn_discussions === true}
      urls={[...extraUrls, ...relatedUrls]}
    />
  )
}
