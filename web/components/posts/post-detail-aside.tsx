import { PostRelatedPostsAside } from '@/components/tags/post-related-posts-aside'
import { PostRelatedTopicsAside } from '@/components/tags/post-related-topics-aside'
import { PostRelatedUrlsAside } from '@/components/tags/post-related-urls-aside'
import { HackerNewsReferencesAside } from '@/components/hacker-news/hacker-news-references-aside'
import type { HackerNewsReferenceDetail } from '@/types/hacker-news'
import { ContributeCtaAside } from '@/components/asides/contribute-cta-aside'
import PostFollowContext from '@/components/posts/post-follow-context'
import { PostReviewReferralLinksAside } from '@/components/posts/post-review-referral-links-aside'
import { PostAuthorAside } from '@/components/posts/post-author-aside'
import type { Post, AuthorAside } from '@/types/posts'
import { SequentialAsideSuspense } from '@/components/asides/sequential-aside-suspense'
import type { getTranslations } from '@/lib/i18n/get-translations'

interface PostDetailAsideProps {
  t: Awaited<ReturnType<typeof getTranslations>>
  post: Post
  authorAside: AuthorAside | null
  hackerNewsReferences?: HackerNewsReferenceDetail
}

export function PostDetailAside({
  t,
  post,
  authorAside,
  hackerNewsReferences,
}: PostDetailAsideProps) {
  return (
    <>
      {post.created_by && !post.is_anonymous && (
        <PostAuthorAside
          t={t}
          author={post.created_by}
          aside={authorAside}
          postType={post.post_type}
        />
      )}
      <SequentialAsideSuspense>
        <PostFollowContext id={post.id} />
        <PostReviewReferralLinksAside post={post} />
        <PostRelatedTopicsAside post={post} />
        <PostRelatedPostsAside post={post} />
        <PostRelatedUrlsAside post={post} />
        <ContributeCtaAside />
      </SequentialAsideSuspense>
      <HackerNewsReferencesAside references={hackerNewsReferences} />
    </>
  )
}
