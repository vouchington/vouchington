import type { Metadata } from 'next'

import { getPost } from '@/lib/api/server'
import { getEffectiveContentLanguage } from '@ts-shared/languages/content-languages'
import { getPostPath, getPostTitle, getVoteScoreNet } from '@/lib/post-helpers'
import { isIndexableForSeo } from '@/lib/seo/indexability'
import { createNoIndexMetadata, createPageMetadata } from '@/lib/seo/metadata'
import { buildPlacementImagePath } from '@/lib/utils/image-url'
import { createExcerpt } from '@vouchington/utils/seo-metadata'
import type { PostType } from '@/types/posts'

export async function buildPostDetailMetadata({
  id,
  postType,
  slug,
}: {
  id: string
  postType: PostType
  slug: string
}): Promise<Metadata> {
  try {
    const postResponse = await getPost(id)
    if (!postResponse) return createNoIndexMetadata()
    const post = postResponse.post
    if (post.post_type !== postType) return createNoIndexMetadata()
    const voteScoreNet = getVoteScoreNet(postResponse)
    const isRestrictedAudience = post.privacy !== 'public' || post.broadcast !== 'everyone'
    const noIndex =
      isRestrictedAudience ||
      voteScoreNet === null ||
      !isIndexableForSeo(voteScoreNet) ||
      !!post.archived_at
    const canonicalPath = getPostPath(slug, post)
    return createPageMetadata({
      title: getPostTitle(post),
      description: createExcerpt(postResponse.html ?? post.markdown),
      path: canonicalPath,
      noIndex,
      imagePath: buildPlacementImagePath(post.images?.[0]),
      type: 'article',
      publishedTime: post.created_at,
      modifiedTime: post.updated_at,
      authors: post.created_by?.username ? [post.created_by.username] : undefined,
      contentLanguage: getEffectiveContentLanguage({
        declaredLanguage: post.declared_language,
        detectedLanguage: post.lingua_rs_detected_language,
      }),
    })
  } catch {
    return createNoIndexMetadata()
  }
}
