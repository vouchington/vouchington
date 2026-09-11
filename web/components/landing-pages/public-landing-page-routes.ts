import { reviewHref } from '@/lib/links/entity-href'

export function getReviewHref(slug: string | null, id: string): string {
  return reviewHref({ id, slug })
}
