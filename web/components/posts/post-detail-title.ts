import { getEffectiveContentLanguage } from '@ts-shared/languages/content-languages'
import { humanizePostType } from '@ts-shared/utils/format'
import type { Post } from '@/types/posts'

export function getPostDetailTitle(post: Post) {
  const trimmedTitle = post.title?.trim()
  const hasAuthoredTitle = Boolean(trimmedTitle)
  const heading = trimmedTitle || `Untitled ${humanizePostType(post.post_type)}`
  const contentLanguage = getEffectiveContentLanguage({
    declaredLanguage: post.declared_language,
    detectedLanguage: post.lingua_rs_detected_language,
  })
  return { trimmedTitle, hasAuthoredTitle, heading, contentLanguage }
}
