import { createEntityRelation } from '@/lib/api/client/entity-relations'
import type { Post } from '@/types/posts'
import type { RelatedUrl } from './types'

export async function linkRelatedUrls(saved: Post, relatedUrls: RelatedUrl[]): Promise<void> {
  if (relatedUrls.length === 0) return
  await Promise.allSettled(
    relatedUrls.map(url => createEntityRelation('post', saved.id, 'related', 'url', url.id)),
  )
}
